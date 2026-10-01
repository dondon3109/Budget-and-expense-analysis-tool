import { easeInOut, ease, pop, prog } from "../theme";
import { SCENES, VOICE_OFFSET, f } from "../timing";
import { ProBadge } from "./Badge";

/** Choreography of the Pro badge: flies in on "7 days", punches on "free", leaves on "no credit card". */
export const Badge = ({ abs }: { abs: number }) => {
  const r = abs - SCENES.offer.from - VOICE_OFFSET; // frames since the offer voice starts
  const inAt = f(1.0);
  const stampAt = f(3.4);
  const outAt = f(5.0);
  if (r < inAt - 2 || r > outAt + 24) return null;

  const enter = pop(r, inAt, 10, 110);
  const spin = (1 - prog(r, inAt, 46, ease)) * Math.PI * 3;
  const punch = r >= stampAt ? 0.16 * Math.exp(-(r - stampAt) / 6) : 0;
  const out = prog(r, outAt, 22, easeInOut);
  const bob = Math.sin(r / 16) * 0.03;
  const settleTilt = Math.sin(r / 28) * 0.1;

  return (
    <ProBadge
      scale={enter * (1 + punch) * (1 - out)}
      rotY={spin + settleTilt + out * 3.2 - (r >= stampAt ? 0.18 * Math.exp(-(r - stampAt) / 10) : 0)}
      rotX={Math.sin(r / 21) * 0.07 - 0.04}
      position={[0, 0.45 + bob + out * 1.2 - (1 - enter) * 2.2, 0]}
    />
  );
};
