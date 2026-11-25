/** Whether this browser can draw the 3D pet (WebGL2); otherwise the SVG figure stays. */
export function canDraw3D(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}
