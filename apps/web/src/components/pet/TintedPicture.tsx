import { useId, type CSSProperties } from "react";

import { petColorMatrix, type PetColor, type PetSpecies, type PetStage } from "@zoption/shared";

import { petImageUrl, petMaskUrl, type PetLook } from "../../lib/petImages";
import "./TintedPicture.css";

/**
 * A pet picture in its pet color: the picture as drawn, with a copy on top that is cut to the
 * body mask and run through the color's matrix, so only fur, skin, or feathers change. The
 * original color (or none yet) is just the picture. The phone app draws the same thing in SVG.
 */
export function TintedPicture({
  species,
  stage,
  look,
  color,
  size,
  className,
}: {
  species: PetSpecies;
  stage: PetStage;
  look: PetLook;
  color: PetColor | null;
  size: number;
  className?: string;
}) {
  // useId output holds characters that are not valid in a url(#id) reference.
  const filterId = `pet-tint-${useId().replace(/[^\w-]/g, "")}`;
  const src = petImageUrl(species, stage, look);
  const matrix = color === null ? null : petColorMatrix(color);
  return (
    <span className={className ? `pet-tinted ${className}` : "pet-tinted"}>
      <img src={src} alt="" width={size} height={size} />
      {matrix ? (
        <>
          <svg className="pet-tint-defs" aria-hidden="true" focusable="false">
            <filter id={filterId} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={matrix.join(" ")} />
            </filter>
          </svg>
          <img
            className="pet-tint"
            src={src}
            alt=""
            width={size}
            height={size}
            style={
              {
                filter: `url(#${filterId})`,
                "--pet-mask": `url(${petMaskUrl(species, stage, look)})`,
              } as CSSProperties
            }
          />
        </>
      ) : null}
    </span>
  );
}
