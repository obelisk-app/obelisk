/** The slice of jsdom the crawl uses (the package ships no types; vitest uses it untyped). */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, options?: { contentType?: string });
    readonly window: Window & typeof globalThis;
  }
}
