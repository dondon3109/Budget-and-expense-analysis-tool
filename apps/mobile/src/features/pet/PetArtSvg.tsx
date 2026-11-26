import type { PetLayer, PetShape } from "@zoption/shared";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

const CANVAS = 200;

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
    <Defs>
      <RadialGradient
        id={id}
        cx={gradient.cx}
        cy={gradient.cy}
        r={gradient.r}
        fx={gradient.fx ?? gradient.cx}
        fy={gradient.fy ?? gradient.cy}
      >
        {gradient.stops.map((stop, index) => (
          <Stop
            key={index}
            offset={stop.offset}
            stopColor={stop.color}
            stopOpacity={stop.opacity ?? 1}
          />
        ))}
      </RadialGradient>
    </Defs>
  ) : null;
  if (shape.kind === "path")
    return (
      <>
        {defs}
        <Path d={shape.d} {...paint} />
      </>
    );
  if (shape.kind === "circle")
    return (
      <>
        {defs}
        <Circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />
      </>
    );
  return (
    <>
      {defs}
      <Ellipse
        cx={shape.cx}
        cy={shape.cy}
        rx={shape.rx}
        ry={shape.ry}
        rotation={shape.rotate}
        origin={shape.rotate ? `${shape.cx}, ${shape.cy}` : undefined}
        {...paint}
      />
    </>
  );
}

/**
 * Shared pet art layers as one SVG, the same drawing as the web. Ids for clips and gradients start
 * with `idBase`, which must be unique among mounted pet art.
 */
export function PetArtSvg({
  layers,
  size,
  idBase,
}: {
  layers: PetLayer[];
  size: number;
  idBase: string;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
      {layers.map((layer, index) => {
        const layerId = `${idBase}l${index}`;
        const shapes = layer.shapes.map((shape, i) => (
          <Shape key={i} shape={shape} id={`${layerId}g${i}`} />
        ));
        return (
          <G key={index} transform={layer.transform}>
            {layer.clip ? (
              <>
                <Defs>
                  <ClipPath id={`${layerId}c`}>
                    <Path d={layer.clip} />
                  </ClipPath>
                </Defs>
                <G clipPath={`url(#${layerId}c)`}>{shapes}</G>
              </>
            ) : (
              shapes
            )}
          </G>
        );
      })}
    </Svg>
  );
}
