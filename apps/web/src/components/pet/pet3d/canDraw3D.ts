let supported: boolean | null = null;

/**
 * Whether this browser can draw the 3D pet (WebGL2); otherwise the SVG figure stays. Probed once
 * per page load and the probe context released at once: browsers cap live WebGL contexts and drop
 * the oldest past the cap, which would be the pet's own canvas.
 */
export function canDraw3D(): boolean {
  if (supported !== null) return supported;
  if (typeof document === "undefined") return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    supported = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    supported = false;
  }
  return supported;
}
