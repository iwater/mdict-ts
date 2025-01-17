/*
 * minilzo-js
 * JavaScript port of minilzo by Alistair Braidwood
 *
 *
 * This library is free software; you can redistribute it and/or
 *  modify it under the terms of the GNU General Public License as
 *  published by the Free Software Foundation; either version 2 of
 *  the License, or (at your option) any later version.
 *
 * You should have received a copy of the GNU General Public License
 *  along with the minilzo-js library; see the file COPYING.
 *  If not, write to the Free Software Foundation, Inc.,
 *  51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 */

/*
 * original minilzo.c by:
 *
 * Markus F.X.J. Oberhumer
 * <markus@oberhumer.com>
 * http://www.oberhumer.com/opensource/lzo/
 */

/*
 * NOTE:
 *   the full LZO package can be found at
 *   http://www.oberhumer.com/opensource/lzo/
 */

export let lzo = (function () {
    function _lzo1x() {
    }

    _lzo1x.prototype = {
        blockSize: 4096,

        OK: 0,
        INPUT_OVERRUN: -4,
        OUTPUT_OVERRUN: -5,
        LOOKBEHIND_OVERRUN: -6,
        EOF_FOUND: -999,

        buf: null,
        buf32: null,

        out: null,
        out32: null,
        cbl: 0,
        ip_end: 0,
        op_end: 0,
        t: 0,

        ip: 0,
        op: 0,
        m_pos: 0,

        skipToFirstLiteralFun: false,

        extendBuffer: function () {
            let newBuffer = new Uint8Array(this.cbl + this.blockSize);
            newBuffer.set(this.out);
            this.out = newBuffer;
            this.out32 = new Uint32Array(this.out.buffer);
            this.state.outputBuffer = this.out;
            this.cbl = this.out.length;
        },

        match_next: function () {
            // if (op_end - op < t) return OUTPUT_OVERRUN;
            // if (ip_end - ip < t+3) return INPUT_OVERRUN;

            while (this.op + 3 > this.cbl) {
                this.extendBuffer();
            }

            this.out[this.op++] = this.buf[this.ip++];
            if (this.t > 1) {
                this.out[this.op++] = this.buf[this.ip++];
                if (this.t > 2) {
                    this.out[this.op++] = this.buf[this.ip++];
                }
            }

            this.t = this.buf[this.ip++];
        },

        match_done: function () {
            this.t = this.buf[this.ip - 2] & 3;
            return this.t;
        },

        copy_match: function () {
            this.t += 2;
            while (this.op + this.t > this.cbl) {
                this.extendBuffer();
            }

            if (this.t > 4 && this.op % 4 === this.m_pos % 4) {
                while (this.op % 4 > 0) {
                    this.out[this.op++] = this.out[this.m_pos++];
                    this.t--;
                }

                while (this.t > 4) {
                    this.out32[0 | (this.op / 4)] = this.out32[0 | (this.m_pos / 4)];
                    this.op += 4;
                    this.m_pos += 4;
                    this.t -= 4;
                }
            }

            do {
                this.out[this.op++] = this.out[this.m_pos++];
            } while (--this.t > 0);
        },

        copy_from_buf: function () {
            while (this.op + this.t > this.cbl) {
                this.extendBuffer();
            }

            if (this.t > 4 && this.op % 4 === this.ip % 4) {
                while (this.op % 4 > 0) {
                    this.out[this.op++] = this.buf[this.ip++];
                    this.t--;
                }

                while (this.t > 4) {
                    this.out32[0 | (this.op / 4)] = this.buf32[0 | (this.ip / 4)];
                    this.op += 4;
                    this.ip += 4;
                    this.t -= 4;
                }
            }

            do {
                this.out[this.op++] = this.buf[this.ip++];
            } while (--this.t > 0);
        },

        match: function () {
            for (; ;) {
                if (this.t >= 64) {

                    this.m_pos = this.op - 1;
                    this.m_pos -= (this.t >> 2) & 7;
                    this.m_pos -= this.buf[this.ip++] << 3;
                    this.t = (this.t >> 5) - 1;

                    // if ( m_pos < out || m_pos >= op) return LOOKBEHIND_OVERRUN;
                    // if (op_end - op < t+3-1) return OUTPUT_OVERRUN;

                    this.copy_match();

                    if (this.match_done() === 0) {
                        break;
                    } else {
                        this.match_next();
                        continue;
                    }

                } else if (this.t >= 32) {
                    this.t &= 31;
                    if (this.t === 0) {
                        while (this.buf[this.ip] === 0) {
                            this.t += 255;
                            this.ip++;
                            // if (t > -511) return OUTPUT_OVERRUN;
                            // if (ip_end - ip < 1) return INPUT_OVERRUN;
                        }
                        this.t += 31 + this.buf[this.ip++];
                        // if (ip_end - ip < 2) return INPUT_OVERRUN;
                    }

                    this.m_pos = this.op - 1;
                    this.m_pos -= (this.buf[this.ip] >> 2) + (this.buf[this.ip + 1] << 6);

                    this.ip += 2;

                } else if (this.t >= 16) {
                    this.m_pos = this.op;
                    this.m_pos -= (this.t & 8) << 11;

                    this.t &= 7;
                    if (this.t === 0) {
                        while (this.buf[this.ip] === 0) {
                            this.t += 255;
                            this.ip++;
                            // if (t > -511) return OUTPUT_OVERRUN;
                            // if (ip_end - ip < 1) return INPUT_OVERRUN;
                        }
                        this.t += 7 + this.buf[this.ip++];
                        // if (ip_end - ip < 2) return INPUT_OVERRUN;
                    }

                    this.m_pos -= (this.buf[this.ip] >> 2) + (this.buf[this.ip + 1] << 6);

                    this.ip += 2;
                    if (this.m_pos === this.op) {
                        this.state.outputBuffer = this.state.outputBuffer.subarray(0, this.op);
                        return this.EOF_FOUND;
                    }
                    this.m_pos -= 0x4000;

                } else {
                    this.m_pos = this.op - 1;
                    this.m_pos -= this.t >> 2;
                    this.m_pos -= this.buf[this.ip++] << 2;

                    // if (m_pos < out || m_pos >= op) return LOOKBEHIND_OVERRUN;
                    // if (op_end - op < 2) return OUTPUT_OVERRUN;
                    while (this.op + 2 > this.cbl) {
                        this.extendBuffer();
                    }
                    this.out[this.op++] = this.out[this.m_pos++];
                    this.out[this.op++] = this.out[this.m_pos];

                    if (this.match_done() === 0) {
                        break;
                    } else {
                        this.match_next();
                        continue;
                    }
                }

                // if (m_pos < out || m_pos >= op) return LOOKBEHIND_OVERRUN;
                // if (op_end - op < t+3-1) return OUTPUT_OVERRUN;

                this.copy_match();

                if (this.match_done() === 0) {
                    break;
                }

                this.match_next();
            }

            return this.OK;
        },

        decompress: function (state) {
            this.state = state;

            this.buf = this.state.inputBuffer;
            const buf_4b = new Uint8Array(this.buf.length + (4 - this.buf.length % 4));
            buf_4b.set(this.buf);
            this.buf32 = new Uint32Array(buf_4b.buffer);

            this.out = new Uint8Array(this.buf.length + (this.blockSize - this.buf.length % this.blockSize));
            this.out32 = new Uint32Array(this.out.buffer);
            this.cbl = this.out.length;
            this.state.outputBuffer = this.out;
            this.ip_end = this.buf.length;
            this.op_end = this.out.length;
            this.t = 0;

            this.ip = 0;
            this.op = 0;
            this.m_pos = 0;

            this.skipToFirstLiteralFun = false;

            let ret;
            // if (ip_end - ip < 1) return INPUT_OVERRUN;
            if (this.buf[this.ip] > 17) {
                this.t = this.buf[this.ip++] - 17;
                if (this.t < 4) {
                    this.match_next();
                    ret = this.match();
                    if (ret !== this.OK) {
                        return ret === this.EOF_FOUND ? this.OK : ret;
                    }

                } else {
                    // if (op_end - op < t) return OUTPUT_OVERRUN;
                    // if (ip_end - ip < t+3) return INPUT_OVERRUN;
                    this.copy_from_buf();
                    this.skipToFirstLiteralFun = true;
                }
            }

            for (; ;) {
                if (!this.skipToFirstLiteralFun) {
                    // if (ip_end - ip < 3) return INPUT_OVERRUN;
                    this.t = this.buf[this.ip++];

                    if (this.t >= 16) {
                        ret = this.match();
                        if (ret !== this.OK) {
                            return ret === this.EOF_FOUND ? this.OK : ret;
                        }
                        continue;
                    }

                    if (this.t === 0) {
                        while (this.buf[this.ip] === 0) {
                            this.t += 255;
                            this.ip++;
                            // if (t > 511) return INPUT_OVERRUN;
                            // if (ip_end - ip < 1) return INPUT_OVERRUN;
                        }
                        this.t += 15 + this.buf[this.ip++];
                    }
                    // if (op_end - op < t+3) return OUTPUT_OVERRUN;
                    // if (ip_end - ip < t+6) return INPUT_OVERRUN;

                    this.t += 3;
                    this.copy_from_buf();
                } else {
                    this.skipToFirstLiteralFun = false;
                }

                this.t = this.buf[this.ip++];
                if (this.t < 16) {
                    this.m_pos = this.op - (1 + 0x0800);
                    this.m_pos -= this.t >> 2;
                    this.m_pos -= this.buf[this.ip++] << 2;

                    // if ( m_pos <  out || m_pos >= op) return LOOKBEHIND_OVERRUN;
                    // if (op_end - op < 3) return OUTPUT_OVERRUN;
                    while (this.op + 3 > this.cbl) {
                        this.extendBuffer();
                    }
                    this.out[this.op++] = this.out[this.m_pos++];
                    this.out[this.op++] = this.out[this.m_pos++];
                    this.out[this.op++] = this.out[this.m_pos];

                    if (this.match_done() === 0) {
                        continue;
                    } else {
                        this.match_next();
                    }
                }

                ret = this.match();
                if (ret !== this.OK) {
                    return ret === this.EOF_FOUND ? this.OK : ret;
                }
            }

            return this.OK;
        },

        _compressCore: function (in_len, ti) {
            let ip_start = this.ip;
            let ip_end = this.ip + in_len - 20;
            let ii = this.ip;

            this.ip += ti < 4 ? 4 - ti : 0;

            let m_pos;
            let m_off;
            let m_len;
            let dv_hi;
            let dv_lo;
            let dindex;


            this.ip += 1 + ((this.ip - ii) >> 5);

            for (; ;) {
                if (this.ip >= ip_end) {
                    break;
                }

                // dv = this.buf[this.ip] | (this.buf[this.ip + 1] << 8) | (this.buf[this.ip + 2] << 16) | (this.buf[this.ip + 3] << 24);
                // dindex = ((0x1824429d * dv) >> 18) & 16383;
                // The above code doesn't work in JavaScript due to a lack of 64 bit bitwise operations
                // Instead, use (optimised two's complement integer arithmetic)
                // Optimization is based on us only needing the high 16 bits of the lower 32 bit integer.
                dv_lo = this.buf[this.ip] | (this.buf[this.ip + 1] << 8);
                dv_hi = this.buf[this.ip + 2] | (this.buf[this.ip + 3] << 8);
                dindex = (((dv_lo * 0x429d) >>> 16) + (dv_hi * 0x429d) + (dv_lo * 0x1824) & 0xFFFF) >>> 2;

                m_pos = ip_start + this.dict[dindex];

                this.dict[dindex] = this.ip - ip_start;
                if ((dv_hi << 16) + dv_lo !== (this.buf[m_pos] | (this.buf[m_pos + 1] << 8) | (this.buf[m_pos + 2] << 16) | (this.buf[m_pos + 3] << 24))) {
                    this.ip += 1 + ((this.ip - ii) >> 5);
                    continue;
                }
                ii -= ti;
                ti = 0;
                let t = this.ip - ii;

                if (t !== 0) {
                    if (t <= 3) {
                        this.out[this.op - 2] |= t;
                        do {
                            this.out[this.op++] = this.buf[ii++];
                        } while (--t > 0);

                    } else {
                        if (t <= 18) {
                            this.out[this.op++] = t - 3;

                        } else {
                            let tt = t - 18;
                            this.out[this.op++] = 0;
                            while (tt > 255) {
                                tt -= 255;
                                this.out[this.op++] = 0;
                            }
                            this.out[this.op++] = tt;
                        }

                        do {
                            this.out[this.op++] = this.buf[ii++];
                        } while (--t > 0);
                    }
                }

                m_len = 4;

                // let skipTo_m_len_done = false;
                if (this.buf[this.ip + m_len] === this.buf[m_pos + m_len]) {
                    do {
                        m_len += 1;
                        if (this.buf[this.ip + m_len] !== this.buf[m_pos + m_len]) {
                            break;
                        }
                        m_len += 1;
                        if (this.buf[this.ip + m_len] !== this.buf[m_pos + m_len]) {
                            break;
                        }
                        m_len += 1;
                        if (this.buf[this.ip + m_len] !== this.buf[m_pos + m_len]) {
                            break;
                        }
                        m_len += 1;
                        if (this.buf[this.ip + m_len] !== this.buf[m_pos + m_len]) {
                            break;
                        }
                        m_len += 1;
                        if (this.buf[this.ip + m_len] !== this.buf[m_pos + m_len]) {
                            break;
                        }
                        m_len += 1;
                        if (this.buf[this.ip + m_len] !== this.buf[m_pos + m_len]) {
                            break;
                        }
                        m_len += 1;
                        if (this.buf[this.ip + m_len] !== this.buf[m_pos + m_len]) {
                            break;
                        }
                        m_len += 1;
                        if (this.buf[this.ip + m_len] !== this.buf[m_pos + m_len]) {
                            break;
                        }
                        if (this.ip + m_len >= ip_end) {
                            // skipTo_m_len_done = true;
                            break;
                        }
                    } while (this.buf[this.ip + m_len] === this.buf[m_pos + m_len]);
                }

                // if (!skipTo_m_len_done) {
                //     let inc = this.ctzl(this.buf[this.ip + m_len] ^ this.buf[m_pos + m_len]) >> 3;
                //     m_len += inc;
                // }

                m_off = this.ip - m_pos;
                this.ip += m_len;
                ii = this.ip;
                if (m_len <= 8 && m_off <= 0x0800) {

                    m_off -= 1;

                    this.out[this.op++] = ((m_len - 1) << 5) | ((m_off & 7) << 2);
                    this.out[this.op++] = m_off >> 3;

                } else if (m_off <= 0x4000) {
                    m_off -= 1;
                    if (m_len <= 33) {
                        this.out[this.op++] = 32 | (m_len - 2);

                    } else {
                        m_len -= 33;
                        this.out[this.op++] = 32;
                        while (m_len > 255) {
                            m_len -= 255;
                            this.out[this.op++] = 0;
                        }
                        this.out[this.op++] = m_len;
                    }
                    this.out[this.op++] = m_off << 2;
                    this.out[this.op++] = m_off >> 6;
                } else {
                    m_off -= 0x4000;
                    if (m_len <= 9) {
                        this.out[this.op++] = 16 | ((m_off >> 11) & 8) | (m_len - 2);

                    } else {
                        m_len -= 9;
                        this.out[this.op++] = 16 | ((m_off >> 11) & 8);

                        while (m_len > 255) {
                            m_len -= 255;
                            this.out[this.op++] = 0;
                        }
                        this.out[this.op++] = m_len;
                    }
                    this.out[this.op++] = m_off << 2;
                    this.out[this.op++] = m_off >> 6;
                }
            }
            return in_len - ((ii - ip_start) - ti);
        },

        compress: function (state) {
            this.state = state;
            this.ip = 0;
            this.buf = this.state.inputBuffer;
            let in_len = this.buf.length;
            let max_len = in_len + Math.ceil(in_len / 16) + 64 + 3;
            this.state.outputBuffer = new Uint8Array(max_len);
            this.out = this.state.outputBuffer;
            this.op = 0;
            this.dict = new Uint32Array(16384);
            let l = in_len;
            let t = 0;

            while (l > 20) {
                let ll = (l <= 49152) ? l : 49152;
                if ((t + ll) >> 5 <= 0) {
                    break;
                }

                this.dict = new Uint32Array(16384);

                let prev_ip = this.ip;
                t = this._compressCore(ll, t);
                this.ip = prev_ip + ll;
                l -= ll;
            }
            t += l;

            if (t > 0) {
                let ii = in_len - t;

                if (this.op === 0 && t <= 238) {
                    this.out[this.op++] = 17 + t;

                } else if (t <= 3) {
                    this.out[this.op - 2] |= t;

                } else if (t <= 18) {
                    this.out[this.op++] = t - 3;

                } else {
                    let tt = t - 18;
                    this.out[this.op++] = 0;
                    while (tt > 255) {
                        tt -= 255;
                        this.out[this.op++] = 0;
                    }
                    this.out[this.op++] = tt;
                }

                do {
                    this.out[this.op++] = this.buf[ii++];
                } while (--t > 0);
            }

            this.out[this.op++] = 17;
            this.out[this.op++] = 0;
            this.out[this.op++] = 0;

            this.state.outputBuffer = this.out.subarray(0, this.op);
            return this.OK;
        }
    };

    let instance = new _lzo1x();

    return {
        compress: state => instance.compress(state),
        decompress: state => instance.decompress(state)
    };
})();