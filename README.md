## mdict-ts

mdict (*.mdx, *.mdd) file reader
modify to fix error from [mdict-ts](https://github.com/zhangchen915/mdict-ts)
which rewrite form [mdict-js](https://github.com/fengdh/mdict-js)

#### Note:

Because of TextDecoder API , mdict-ts don't support IE and Edge , but you can use polyfill such as `text-encoding`.

#### Installation:

`npm i @iwater/mdict-ts`

#### Usage:

```ts
    import {Mdict} from '@iwater/mdict-ts'
    const mdict = await Mdict.build(file: File)
    
    mdict.getWordList(query, offset?): Promise<Array<{ word: string, offset: number }>>
    mdict.getDefinition(offset): Promise<string> 
```