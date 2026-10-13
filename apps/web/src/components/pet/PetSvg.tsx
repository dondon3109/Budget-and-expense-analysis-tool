import { useId } from "react";

import type { PetLayer, PetMood, PetShape } from "@zoption/shared";

import "./PetSvg.css";

function Shape({ shape }: { shape: PetShape }) {
  const paint = {
    fill: shape.fill ?? "none",
    stroke: shape.stroke,
    strokeWidth: shape.stroke ? shape.strokeWidth : undefined,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    opacity: shape.opacity,
  };
  if (shape.kind === "path") return <path d={shape.d} {...paint} />;
  if (shape.kind === "circle") return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />;
  return (
    <ellipse
      cx={shape.cx}
      cy={shape.cy}
      rx={shape.rx}
      ry={shape.ry}
      transform={shape.rotate ? `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` : undefined}
      {...paint}
    />
  );
}

/**
 * Draws the shared pet art, the same drawing as the phone app. `mood` picks the idle motion in
 * PetSvg.css; `still` draws it without motion, for the egg picker.
 */
export function PetSvg({
  art,
  mood,
  size,
  still = false,
  className,
}: {
  art: PetLayer[];
  mood: PetMood;
  size: number;
  still?: boolean;
  className?: string;
}) {
  const clipBase = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      className={className ? `pet-svg ${className}` : "pet-svg"}
      data-mood={still ? undefined : mood}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {art.map((layer, index) => {
        const clipId = `${clipBase}c${index}`;
        return (
          <g
            key={index}
            data-part={layer.part}
            style={{ transformOrigin: `${layer.origin[0]}px ${layer.origin[1]}px` }}
          >
            {layer.clip ? (
              <>
                <defs>
                  <clipPath id={clipId}>
                    <path d={layer.clip} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#${clipId})`}>
                  {layer.shapes.map((shape, i) => (
                    <Shape key={i} shape={shape} />
                  ))}
                </g>
              </>
            ) : (
              layer.shapes.map((shape, i) => <Shape key={i} shape={shape} />)
            )}
          </g>
        );
      })}
    </svg>
  );
}
