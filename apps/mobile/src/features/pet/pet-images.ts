import type { PetSpecies, PetStage } from "@zoption/shared";

import hedgehogEgg from "../../../assets/pet/hedgehog-egg.webp";
import hedgehogBaby from "../../../assets/pet/hedgehog-baby.webp";
import hedgehogJuvenile from "../../../assets/pet/hedgehog-juvenile.webp";
import hedgehogAdult from "../../../assets/pet/hedgehog-adult.webp";
import hedgehogLegend from "../../../assets/pet/hedgehog-legend.webp";
import pigEgg from "../../../assets/pet/pig-egg.webp";
import pigBaby from "../../../assets/pet/pig-baby.webp";
import pigJuvenile from "../../../assets/pet/pig-juvenile.webp";
import pigAdult from "../../../assets/pet/pig-adult.webp";
import pigLegend from "../../../assets/pet/pig-legend.webp";
import hamsterEgg from "../../../assets/pet/hamster-egg.webp";
import hamsterBaby from "../../../assets/pet/hamster-baby.webp";
import hamsterJuvenile from "../../../assets/pet/hamster-juvenile.webp";
import hamsterAdult from "../../../assets/pet/hamster-adult.webp";
import hamsterLegend from "../../../assets/pet/hamster-legend.webp";
import penguinEgg from "../../../assets/pet/penguin-egg.webp";
import penguinBaby from "../../../assets/pet/penguin-baby.webp";
import penguinJuvenile from "../../../assets/pet/penguin-juvenile.webp";
import penguinAdult from "../../../assets/pet/penguin-adult.webp";
import penguinLegend from "../../../assets/pet/penguin-legend.webp";
import pandaEgg from "../../../assets/pet/panda-egg.webp";
import pandaBaby from "../../../assets/pet/panda-baby.webp";
import pandaJuvenile from "../../../assets/pet/panda-juvenile.webp";
import pandaAdult from "../../../assets/pet/panda-adult.webp";
import pandaLegend from "../../../assets/pet/panda-legend.webp";
import hippoEgg from "../../../assets/pet/hippo-egg.webp";
import hippoBaby from "../../../assets/pet/hippo-baby.webp";
import hippoJuvenile from "../../../assets/pet/hippo-juvenile.webp";
import hippoAdult from "../../../assets/pet/hippo-adult.webp";
import hippoLegend from "../../../assets/pet/hippo-legend.webp";
import tombstone from "../../../assets/pet/tombstone.webp";

// The Grok-drawn pictures for the pet pop-up (prompts in docs/pet.md).
const images: Record<PetSpecies, Record<PetStage, number>> = {
  hedgehog: {
    egg: hedgehogEgg,
    baby: hedgehogBaby,
    juvenile: hedgehogJuvenile,
    adult: hedgehogAdult,
    legend: hedgehogLegend,
  },
  pig: { egg: pigEgg, baby: pigBaby, juvenile: pigJuvenile, adult: pigAdult, legend: pigLegend },
  hamster: {
    egg: hamsterEgg,
    baby: hamsterBaby,
    juvenile: hamsterJuvenile,
    adult: hamsterAdult,
    legend: hamsterLegend,
  },
  penguin: {
    egg: penguinEgg,
    baby: penguinBaby,
    juvenile: penguinJuvenile,
    adult: penguinAdult,
    legend: penguinLegend,
  },
  panda: {
    egg: pandaEgg,
    baby: pandaBaby,
    juvenile: pandaJuvenile,
    adult: pandaAdult,
    legend: pandaLegend,
  },
  hippo: {
    egg: hippoEgg,
    baby: hippoBaby,
    juvenile: hippoJuvenile,
    adult: hippoAdult,
    legend: hippoLegend,
  },
};

/** The picture for a pet, or the tombstone once it has passed away. */
export function petImage(species: PetSpecies | null, stage: PetStage): number {
  return species === null ? tombstone : images[species][stage];
}
