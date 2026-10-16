import { petColorMatrix, type PetColor, type PetSpecies, type PetStage } from "@zoption/shared";
import { useId } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, FeColorMatrix, Filter, Image as SvgImage, Mask } from "react-native-svg";

import { petImage, petMask, type PetLook } from "./pet-images";

interface TintedPetImageProps {
  species: PetSpecies;
  stage: PetStage;
  look: PetLook;
  color: PetColor | null;
  size: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A pet picture in its pet color: the picture as drawn, with a copy on top that is cut to the
 * body mask and run through the color's matrix, so only fur, skin, or feathers change. The
 * original color (or none yet) is just the picture. The web app draws the same thing with CSS.
 */
export function TintedPetImage({ species, stage, look, color, size, style }: TintedPetImageProps) {
  // useId output holds characters that are not valid in a url(#id) reference.
  const id = useId().replace(/[^\w-]/g, "");
  const source = petImage(species, stage, look);
  const matrix = color === null ? null : petColorMatrix(color);
  // Explicit sizes, not absoluteFill: Android otherwise draws the picture at its 512px file size.
  const box = { position: "absolute" as const, top: 0, left: 0, width: size, height: size };

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Image accessibilityIgnoresInvertColors source={source} style={box} />
      {matrix ? (
        <Svg width={size} height={size} style={box}>
          <Defs>
            <Filter id={`tint-${id}`} x="0" y="0" width="100%" height="100%">
              <FeColorMatrix type="matrix" values={matrix} />
            </Filter>
            <Mask
              id={`mask-${id}`}
              x="0"
              y="0"
              width={size}
              height={size}
              maskUnits="userSpaceOnUse"
            >
              <SvgImage href={petMask(species, stage, look)} width={size} height={size} />
            </Mask>
          </Defs>
          <SvgImage
            href={source}
            width={size}
            height={size}
            filter={`url(#tint-${id})`}
            mask={`url(#mask-${id})`}
          />
        </Svg>
      ) : null}
    </View>
  );
}
