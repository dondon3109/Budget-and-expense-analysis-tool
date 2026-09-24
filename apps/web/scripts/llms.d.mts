/** Hand-written types for `llms.mjs`; see `robots.d.mts` for why. */
export interface LlmsPage {
  url: string;
  title: string;
  description: string;
}

export declare const LLMS_PAGES_MARKER: string;
export declare function llmsPageList(pages: LlmsPage[]): string;
export declare function withLlmsPageList(template: string, pages: LlmsPage[]): string;
