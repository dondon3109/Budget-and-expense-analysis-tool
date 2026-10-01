import { useMemo } from "react";
import { continueRender, delayRender } from "remotion";
import * as THREE from "three";
import { C, FONT } from "../theme";

/** The Zoption mark from public/zoption-mark.svg, drawn at `size` px with its top-left at (x, y). */
export const drawLogoMark = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  const k = size / 512;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = C.logoBg;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = C.cream;
  ctx.lineWidth = 52;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(new Path2D("M152 160H360L152 352H360"));
  ctx.fillStyle = C.brand;
  ctx.fillRect(280, 326, 80, 52);
  ctx.beginPath();
  ctx.arc(360, 352, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.logoBg;
  ctx.fillRect(270, 320, 10, 64);
  ctx.restore();
};

/**
 * A CanvasTexture that is drawn once now and again when the brand fonts finish loading,
 * holding the frame (delayRender) until the second draw is on the GPU.
 */
export const useCanvasTexture = (
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) =>
  useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    draw(ctx, w, h);
    const handle = delayRender("Drawing canvas texture");
    void Promise.all([
      document.fonts.load(`800 100px ${FONT.display}`),
      document.fonts.load(`600 40px ${FONT.ui}`),
    ])
      .catch(() => undefined)
      .then(() => {
        ctx.clearRect(0, 0, w, h);
        draw(ctx, w, h);
        texture.needsUpdate = true;
        continueRender(handle);
      });
    return texture;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

/** Soft round dot used for star sprites. */
export const makeDotTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
};
