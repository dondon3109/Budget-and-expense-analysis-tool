import { useId } from "react";

import type { PetLayer, PetShape } from "@zoption/shared";

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
 * Draws the shared egg art, the same drawing as the phone app. It sways gently (PetSvg.css);
 * `still` draws it without motion, for the egg picker and the hatch shine.
 */
export function PetSvg({
  art,
  size,
  still = false,
  className,
}: {
  art: PetLayer[];
  size: number;
  still?: boolean;
  className?: string;
}) {
  const clipBase = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      className={className ? `pet-svg ${className}` : "pet-svg"}
      data-sway={still ? undefined : true}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {art.map((layer, index) => {
        const clipId = `${clipBase}c${index}`;
        return (
          <g key={index}>
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
