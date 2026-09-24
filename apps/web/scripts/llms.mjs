/**
 * Fills the page list in `public/llms.txt` and `public/llms-full.txt` from the public
 * route manifest, so the files AI crawlers read cannot drift from the sitemap. The
 * product facts around the marker stay hand-written.
 */
export const LLMS_PAGES_MARKER = "{{public-pages}}";

export function llmsPageList(pages) {
  return pages
    .map(({ url, title, description }) => {
      const name = title.replace(/\s*[—|]\s*Zoption$/, "");
      return `- [${name}](${url}): ${description}`;
    })
    .join("\n");
}

export function withLlmsPageList(template, pages) {
  const occurrences = template.split(LLMS_PAGES_MARKER).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one ${LLMS_PAGES_MARKER} marker, found ${occurrences}.`);
  }
  return template.replace(LLMS_PAGES_MARKER, llmsPageList(pages));
}
