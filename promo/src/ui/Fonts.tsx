import { useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

const FACES: [string, string, string][] = [
  ["Bricolage Grotesque", "fonts/bricolage-grotesque-latin.woff2", "200 800"],
  ["Geist", "fonts/geist-latin.woff2", "100 900"],
  ["Geist Mono", "fonts/geist-mono-latin.woff2", "100 900"],
];

/** Blocks rendering until the brand fonts are loaded, so no frame falls back to a system font. */
export const Fonts = () => {
  useState(() => {
    const handle = delayRender("Loading brand fonts");
    Promise.all(
      FACES.map(async ([family, path, weight]) => {
        const face = new FontFace(family, `url(${staticFile(path)})`, { weight });
        await face.load();
        (document.fonts as unknown as { add(face: FontFace): void }).add(face);
      }),
    )
      .catch((error) => console.error("Font load failed", error))
      .finally(() => continueRender(handle));
    return null;
  });
  return null;
};
