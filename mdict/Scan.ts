import {lzo} from '../lib/lzo1x';
import {inflate} from 'pako';
import {isBrowser, newUint8Array, dataView, textDecoder} from "./util";

export class Scan {
    private readonly searchTextLen: (dv, offset) => (number | number);
    private decoder: TextDecoder;
    private readonly bpu: number;
    private readShort: () => any;
    private readNum: () => any;
    private readonly v2: boolean;
    private dv: any;
    private readonly tail: number;
    private checksumV2: () => void;
    private offset: number;
    private buf: any;

    constructor(attrs) {
        attrs.Encoding = attrs.Encoding || 'UTF-16';

        this.searchTextLen = (dv, offset) => {
            let mark = offset;
            if (attrs.Encoding === 'UTF-16') {
                while (this.dv.getUint16(offset)) {
                    offset += this.bpu
                    /* scan for \u0000 */
                }
                return offset - mark;
            } else {
                while (dv.getUint8(offset++)) { /* scan for NUL */
                }
                return offset - mark - 1;
            }
        };

        this.decoder = new textDecoder(attrs.Encoding || 'UTF-16LE');

        this.bpu = (attrs.Encoding === 'UTF-16') ? 2 : 1;

        this.readShort = () => this.readUint8();
        // read a "short" number representing kewword text size, 8-bit for version < 2, 16-bit for version >= 2

        this.readNum = () => this.readInt();

        if (parseInt(attrs.GeneratedByEngineVersion, 10) >= 2.0) {
            this.v2 = true;
            this.tail = this.bpu;

            // HUGE dictionary file (>4G) is not supported, take only lower 32-bit
            this.readNum = () => {
                this.forward(4);
                return this.readInt();
            };
            this.readShort = () => this.readUint16();
            this.checksumV2 = () => this.checksum()
        } else {
            this.tail = 0;
        }
    }

    init(buf) {
        this.offset = 0;
        this.buf = buf;
        this.dv = new dataView(buf);
        return this;
    }

    forward(len) {
        this.offset += len;
        return this;
    }

    // MDict file format uses big endian to store number
    // 32-bit unsigned int
    readInt() {
        return [this.dv.getUint32(this.offset), this.forward(4)][0];
    }

    readUint16() {
        return [this.dv.getUint16(this.offset), this.forward(2)][0];
    }

    readUint8() {
        return [this.dv.getUint8(this.offset), this.forward(1)][0];
    }

    // Read data to an Uint8Array and decode it to text with specified encoding.
    // Text length in bytes is determined by searching terminated NUL.
    // NOTE: After decoding the text, it is need to forward extra "tail" bytes according to specified encoding.
    readText() {
        let len = this.searchTextLen(this.dv, this.offset);
        return [this.decoder.decode(newUint8Array(this.buf, this.offset, len)), this.forward(len + this.bpu)][0];
    }

    // Read data to an Uint8Array and decode it to text with specified encoding.
    // @param len length in basic unit, need to multiply byte per unit to get length in bytes
    // NOTE: After decoding the text, it is need to forward extra "tail" bytes according to specified encoding.
    readTextSized(len) {
        len *= this.bpu;
        return [this.decoder.decode(newUint8Array(this.buf, this.offset, len)), this.forward(len + this.tail)][0];
    }

    // Skip checksum, just ignore it anyway.
    checksum() {
        this.forward(4);
    }

    // Read data block of keyword index, key block or record content.
    // These data block are maybe in compressed (gzip or lzo) format, while keyword index maybe be encrypted.
    // @see https://github.com/zhansliu/writemdict/blob/master/fileformat.md#compression (with typo mistake)
    readBlock(len, expectedBufSize, decryptor?) {
        let comp_type = this.dv.getUint8(this.offset);  // compression type, 0 = non, 1 = lzo, 2 = gzip
        if (comp_type === 0) {
            if (this.v2) this.forward(8);  // for version >= 2, skip comp_type (4 bytes with tailing \x00) and checksum (4 bytes)
            return this;
        } else {
            let tmp;
            // skip comp_type (4 bytes with tailing \x00) and checksum (4 bytes)
            this.offset += 8;
            len -= 8;
            if (isBrowser) {
                tmp = new Uint8Array(this.buf, this.offset, len);
            } else {
                tmp = new Uint8Array(len);
                this.buf.copy(tmp, 0, this.offset, this.offset + len);
            }

            if (decryptor) {
                let passkey = new Uint8Array(8);
                if (isBrowser) {
                    passkey.set(new Uint8Array(this.buf, this.offset - 4, 4));  // key part 1: checksum
                } else {
                    this.buf.copy(passkey, 0, this.offset - 4, this.offset);// key part 1: checksum
                }

                passkey.set([0x95, 0x36, 0x00, 0x00], 4);         // key part 2: fixed data
                tmp = decryptor(tmp, passkey);
            }

            tmp = comp_type === 2 ? inflate(tmp) : lzo.decompress(tmp);
            this.forward(len);
            return this.init(isBrowser ? tmp.buffer : Buffer.from(tmp));
        }
    }

    // Read raw data as Buffer from current this.offset with specified length in bytes
    readRaw(len: number) {
        return this.buf.slice(this.offset, this.offset + len);
    }
}