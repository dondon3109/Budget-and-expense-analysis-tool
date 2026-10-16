import type { PetSpecies, PetStage } from "@zoption/shared";

import { petMasks } from "./pet-masks";

import hedgehogEgg from "../../../assets/pet/hedgehog-egg.webp";
import hedgehogBaby from "../../../assets/pet/hedgehog-baby.webp";
import hedgehogBabyBlink from "../../../assets/pet/hedgehog-baby-blink.webp";
import hedgehogBabySick from "../../../assets/pet/hedgehog-baby-sick.webp";
import hedgehogBabyFading from "../../../assets/pet/hedgehog-baby-fading.webp";
import hedgehogJuvenile from "../../../assets/pet/hedgehog-juvenile.webp";
import hedgehogJuvenileBlink from "../../../assets/pet/hedgehog-juvenile-blink.webp";
import hedgehogJuvenileSick from "../../../assets/pet/hedgehog-juvenile-sick.webp";
import hedgehogJuvenileFading from "../../../assets/pet/hedgehog-juvenile-fading.webp";
import hedgehogAdult from "../../../assets/pet/hedgehog-adult.webp";
import hedgehogAdultBlink from "../../../assets/pet/hedgehog-adult-blink.webp";
import hedgehogAdultSick from "../../../assets/pet/hedgehog-adult-sick.webp";
import hedgehogAdultFading from "../../../assets/pet/hedgehog-adult-fading.webp";
import hedgehogLegend from "../../../assets/pet/hedgehog-legend.webp";
import hedgehogLegendBlink from "../../../assets/pet/hedgehog-legend-blink.webp";
import hedgehogLegendSick from "../../../assets/pet/hedgehog-legend-sick.webp";
import hedgehogLegendFading from "../../../assets/pet/hedgehog-legend-fading.webp";
import pigEgg from "../../../assets/pet/pig-egg.webp";
import pigBaby from "../../../assets/pet/pig-baby.webp";
import pigBabyBlink from "../../../assets/pet/pig-baby-blink.webp";
import pigBabySick from "../../../assets/pet/pig-baby-sick.webp";
import pigBabyFading from "../../../assets/pet/pig-baby-fading.webp";
import pigJuvenile from "../../../assets/pet/pig-juvenile.webp";
import pigJuvenileBlink from "../../../assets/pet/pig-juvenile-blink.webp";
import pigJuvenileSick from "../../../assets/pet/pig-juvenile-sick.webp";
import pigJuvenileFading from "../../../assets/pet/pig-juvenile-fading.webp";
import pigAdult from "../../../assets/pet/pig-adult.webp";
import pigAdultBlink from "../../../assets/pet/pig-adult-blink.webp";
import pigAdultSick from "../../../assets/pet/pig-adult-sick.webp";
import pigAdultFading from "../../../assets/pet/pig-adult-fading.webp";
import pigLegend from "../../../assets/pet/pig-legend.webp";
import pigLegendBlink from "../../../assets/pet/pig-legend-blink.webp";
import pigLegendSick from "../../../assets/pet/pig-legend-sick.webp";
import pigLegendFading from "../../../assets/pet/pig-legend-fading.webp";
import hamsterEgg from "../../../assets/pet/hamster-egg.webp";
import hamsterBaby from "../../../assets/pet/hamster-baby.webp";
import hamsterBabyBlink from "../../../assets/pet/hamster-baby-blink.webp";
import hamsterBabySick from "../../../assets/pet/hamster-baby-sick.webp";
import hamsterBabyFading from "../../../assets/pet/hamster-baby-fading.webp";
import hamsterJuvenile from "../../../assets/pet/hamster-juvenile.webp";
import hamsterJuvenileBlink from "../../../assets/pet/hamster-juvenile-blink.webp";
import hamsterJuvenileSick from "../../../assets/pet/hamster-juvenile-sick.webp";
import hamsterJuvenileFading from "../../../assets/pet/hamster-juvenile-fading.webp";
import hamsterAdult from "../../../assets/pet/hamster-adult.webp";
import hamsterAdultBlink from "../../../assets/pet/hamster-adult-blink.webp";
import hamsterAdultSick from "../../../assets/pet/hamster-adult-sick.webp";
import hamsterAdultFading from "../../../assets/pet/hamster-adult-fading.webp";
import hamsterLegend from "../../../assets/pet/hamster-legend.webp";
import hamsterLegendBlink from "../../../assets/pet/hamster-legend-blink.webp";
import hamsterLegendSick from "../../../assets/pet/hamster-legend-sick.webp";
import hamsterLegendFading from "../../../assets/pet/hamster-legend-fading.webp";
import penguinEgg from "../../../assets/pet/penguin-egg.webp";
import penguinBaby from "../../../assets/pet/penguin-baby.webp";
import penguinBabyBlink from "../../../assets/pet/penguin-baby-blink.webp";
import penguinBabySick from "../../../assets/pet/penguin-baby-sick.webp";
import penguinBabyFading from "../../../assets/pet/penguin-baby-fading.webp";
import penguinJuvenile from "../../../assets/pet/penguin-juvenile.webp";
import penguinJuvenileBlink from "../../../assets/pet/penguin-juvenile-blink.webp";
import penguinJuvenileSick from "../../../assets/pet/penguin-juvenile-sick.webp";
import penguinJuvenileFading from "../../../assets/pet/penguin-juvenile-fading.webp";
import penguinAdult from "../../../assets/pet/penguin-adult.webp";
import penguinAdultBlink from "../../../assets/pet/penguin-adult-blink.webp";
import penguinAdultSick from "../../../assets/pet/penguin-adult-sick.webp";
import penguinAdultFading from "../../../assets/pet/penguin-adult-fading.webp";
import penguinLegend from "../../../assets/pet/penguin-legend.webp";
import penguinLegendBlink from "../../../assets/pet/penguin-legend-blink.webp";
import penguinLegendSick from "../../../assets/pet/penguin-legend-sick.webp";
import penguinLegendFading from "../../../assets/pet/penguin-legend-fading.webp";
import pandaEgg from "../../../assets/pet/panda-egg.webp";
import pandaBaby from "../../../assets/pet/panda-baby.webp";
import pandaBabyBlink from "../../../assets/pet/panda-baby-blink.webp";
import pandaBabySick from "../../../assets/pet/panda-baby-sick.webp";
import pandaBabyFading from "../../../assets/pet/panda-baby-fading.webp";
import pandaJuvenile from "../../../assets/pet/panda-juvenile.webp";
import pandaJuvenileBlink from "../../../assets/pet/panda-juvenile-blink.webp";
import pandaJuvenileSick from "../../../assets/pet/panda-juvenile-sick.webp";
import pandaJuvenileFading from "../../../assets/pet/panda-juvenile-fading.webp";
import pandaAdult from "../../../assets/pet/panda-adult.webp";
import pandaAdultBlink from "../../../assets/pet/panda-adult-blink.webp";
import pandaAdultSick from "../../../assets/pet/panda-adult-sick.webp";
import pandaAdultFading from "../../../assets/pet/panda-adult-fading.webp";
import pandaLegend from "../../../assets/pet/panda-legend.webp";
import pandaLegendBlink from "../../../assets/pet/panda-legend-blink.webp";
import pandaLegendSick from "../../../assets/pet/panda-legend-sick.webp";
import pandaLegendFading from "../../../assets/pet/panda-legend-fading.webp";
import hippoEgg from "../../../assets/pet/hippo-egg.webp";
import hippoBaby from "../../../assets/pet/hippo-baby.webp";
import hippoBabyBlink from "../../../assets/pet/hippo-baby-blink.webp";
import hippoBabySick from "../../../assets/pet/hippo-baby-sick.webp";
import hippoBabyFading from "../../../assets/pet/hippo-baby-fading.webp";
import hippoJuvenile from "../../../assets/pet/hippo-juvenile.webp";
import hippoJuvenileBlink from "../../../assets/pet/hippo-juvenile-blink.webp";
import hippoJuvenileSick from "../../../assets/pet/hippo-juvenile-sick.webp";
import hippoJuvenileFading from "../../../assets/pet/hippo-juvenile-fading.webp";
import hippoAdult from "../../../assets/pet/hippo-adult.webp";
import hippoAdultBlink from "../../../assets/pet/hippo-adult-blink.webp";
import hippoAdultSick from "../../../assets/pet/hippo-adult-sick.webp";
import hippoAdultFading from "../../../assets/pet/hippo-adult-fading.webp";
import hippoLegend from "../../../assets/pet/hippo-legend.webp";
import hippoLegendBlink from "../../../assets/pet/hippo-legend-blink.webp";
import hippoLegendSick from "../../../assets/pet/hippo-legend-sick.webp";
import hippoLegendFading from "../../../assets/pet/hippo-legend-fading.webp";
import tombstone from "../../../assets/pet/tombstone.webp";

/** Which picture of a hatched pet: its healthy pose, that pose mid-blink, or sick or fading. */
export type PetLook = "healthy" | "blink" | "sick" | "fading";

type HatchedStage = Exclude<PetStage, "egg">;

// The Grok-drawn pictures (prompts in docs/pet.md).
const images: Record<PetSpecies, { egg: number } & Record<HatchedStage, Record<PetLook, number>>> =
  {
    hedgehog: {
      egg: hedgehogEgg,
      baby: {
        healthy: hedgehogBaby,
        blink: hedgehogBabyBlink,
        sick: hedgehogBabySick,
        fading: hedgehogBabyFading,
      },
      juvenile: {
        healthy: hedgehogJuvenile,
        blink: hedgehogJuvenileBlink,
        sick: hedgehogJuvenileSick,
        fading: hedgehogJuvenileFading,
      },
      adult: {
        healthy: hedgehogAdult,
        blink: hedgehogAdultBlink,
        sick: hedgehogAdultSick,
        fading: hedgehogAdultFading,
      },
      legend: {
        healthy: hedgehogLegend,
        blink: hedgehogLegendBlink,
        sick: hedgehogLegendSick,
        fading: hedgehogLegendFading,
      },
    },
    pig: {
      egg: pigEgg,
      baby: { healthy: pigBaby, blink: pigBabyBlink, sick: pigBabySick, fading: pigBabyFading },
      juvenile: {
        healthy: pigJuvenile,
        blink: pigJuvenileBlink,
        sick: pigJuvenileSick,
        fading: pigJuvenileFading,
      },
      adult: {
        healthy: pigAdult,
        blink: pigAdultBlink,
        sick: pigAdultSick,
        fading: pigAdultFading,
      },
      legend: {
        healthy: pigLegend,
        blink: pigLegendBlink,
        sick: pigLegendSick,
        fading: pigLegendFading,
      },
    },
    hamster: {
      egg: hamsterEgg,
      baby: {
        healthy: hamsterBaby,
        blink: hamsterBabyBlink,
        sick: hamsterBabySick,
        fading: hamsterBabyFading,
      },
      juvenile: {
        healthy: hamsterJuvenile,
        blink: hamsterJuvenileBlink,
        sick: hamsterJuvenileSick,
        fading: hamsterJuvenileFading,
      },
      adult: {
        healthy: hamsterAdult,
        blink: hamsterAdultBlink,
        sick: hamsterAdultSick,
        fading: hamsterAdultFading,
      },
      legend: {
        healthy: hamsterLegend,
        blink: hamsterLegendBlink,
        sick: hamsterLegendSick,
        fading: hamsterLegendFading,
      },
    },
    penguin: {
      egg: penguinEgg,
      baby: {
        healthy: penguinBaby,
        blink: penguinBabyBlink,
        sick: penguinBabySick,
        fading: penguinBabyFading,
      },
      juvenile: {
        healthy: penguinJuvenile,
        blink: penguinJuvenileBlink,
        sick: penguinJuvenileSick,
        fading: penguinJuvenileFading,
      },
      adult: {
        healthy: penguinAdult,
        blink: penguinAdultBlink,
        sick: penguinAdultSick,
        fading: penguinAdultFading,
      },
      legend: {
        healthy: penguinLegend,
        blink: penguinLegendBlink,
        sick: penguinLegendSick,
        fading: penguinLegendFading,
      },
    },
    panda: {
      egg: pandaEgg,
      baby: {
        healthy: pandaBaby,
        blink: pandaBabyBlink,
        sick: pandaBabySick,
        fading: pandaBabyFading,
      },
      juvenile: {
        healthy: pandaJuvenile,
        blink: pandaJuvenileBlink,
        sick: pandaJuvenileSick,
        fading: pandaJuvenileFading,
      },
      adult: {
        healthy: pandaAdult,
        blink: pandaAdultBlink,
        sick: pandaAdultSick,
        fading: pandaAdultFading,
      },
      legend: {
        healthy: pandaLegend,
        blink: pandaLegendBlink,
        sick: pandaLegendSick,
        fading: pandaLegendFading,
      },
    },
    hippo: {
      egg: hippoEgg,
      baby: {
        healthy: hippoBaby,
        blink: hippoBabyBlink,
        sick: hippoBabySick,
        fading: hippoBabyFading,
      },
      juvenile: {
        healthy: hippoJuvenile,
        blink: hippoJuvenileBlink,
        sick: hippoJuvenileSick,
        fading: hippoJuvenileFading,
      },
      adult: {
        healthy: hippoAdult,
        blink: hippoAdultBlink,
        sick: hippoAdultSick,
        fading: hippoAdultFading,
      },
      legend: {
        healthy: hippoLegend,
        blink: hippoLegendBlink,
        sick: hippoLegendSick,
        fading: hippoLegendFading,
      },
    },
  };

/** The body mask a pet color tints through (scripts/generate-pet-masks.mjs). Eggs have one look. */
export function petMask(species: PetSpecies, stage: PetStage, look: PetLook = "healthy"): number {
  const name =
    stage === "egg" || look === "healthy" ? `${species}-${stage}` : `${species}-${stage}-${look}`;
  return petMasks[name]!;
}

/** The picture for a pet, or the tombstone once it has passed away. Eggs have one look. */
export function petImage(
  species: PetSpecies | null,
  stage: PetStage,
  look: PetLook = "healthy",
): number {
  if (species === null) return tombstone;
  if (stage === "egg") return images[species].egg;
  return images[species][stage][look];
}
