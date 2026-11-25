import { useId } from "react";

import type { PetLayer, PetShape } from "@zoption/shared";

import "./PetSvg.css";

function Shape({ shape, id }: { shape: PetShape; id: string }) {
  const gradient = typeof shape.fill === "object" ? shape.fill : null;
  const paint = {
    fill: typeof shape.fill === "object" ? `url(#${id})` : (shape.fill ?? "none"),
    stroke: shape.stroke,
    strokeWidth: shape.stroke ? shape.strokeWidth : undefined,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    opacity: shape.opacity,
  };
  const defs = gradient ? (
    <defs>
      <radialGradient
        id={id}
        cx={gradient.cx}
        cy={gradient.cy}
        r={gradient.r}
        fx={gradient.fx}
        fy={gradient.fy}
      >
        {gradient.stops.map((stop, index) => (
          <stop
            key={index}
            offset={stop.offset}
            stopColor={stop.color}
            stopOpacity={stop.opacity}
          />
        ))}
      </radialGradient>
    </defs>
  ) : null;
  if (shape.kind === "path")
    return (
      <>
        {defs}
        <path d={shape.d} {...paint} />
      </>
    );
  if (shape.kind === "circle")
    return (
      <>
        {defs}
        <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />
      </>
    );
  return (
    <>
      {defs}
      <ellipse
        cx={shape.cx}
        cy={shape.cy}
        rx={shape.rx}
        ry={shape.ry}
        transform={shape.rotate ? `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` : undefined}
        {...paint}
      />
    </>
  );
}

/**
 * The shapes of shared pet art layers, for inside an `<svg viewBox="0 0 200 200">`. Ids for clips
 * and gradients start with `idBase`, which must be unique on the page.
 */
export function PetLayers({ layers, idBase }: { layers: PetLayer[]; idBase: string }) {
  return layers.map((layer, index) => {
    const layerId = `${idBase}l${index}`;
    const shapes = layer.shapes.map((shape, i) => (
      <Shape key={i} shape={shape} id={`${layerId}g${i}`} />
    ));
    return (
      <g key={index} transform={layer.transform}>
        {layer.clip ? (
          <>
            <defs>
              <clipPath id={`${layerId}c`}>
                <path d={layer.clip} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${layerId}c)`}>{shapes}</g>
          </>
        ) : (
          shapes
        )}
      </g>
    );
  });
}

/** A page-unique id prefix that is valid inside `url(#…)`. */
export function usePetArtId() {
  return useId().replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * Draws shared pet art (an egg, the hatch shine, or the tombstone), the same drawing as the phone
 * app. An egg sways gently (PetSvg.css); `still` draws it without motion, for the egg picker and
 * the hatch shine.
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
  const idBase = usePetArtId();
  return (
    <svg
      className={className ? `pet-svg ${className}` : "pet-svg"}
      data-sway={still ? undefined : true}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <PetLayers layers={art} idBase={idBase} />
    </svg>
  );
}
