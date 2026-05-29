export const SCENT_FAMILIES = [
  "Fresh & Marine",
  "Citrus & Green",
  "Oud & Floral",
  "Spice & Amber",
  "Woody & Deep",
  "Floral & Musk",
] as const;

export type ScentFamily = (typeof SCENT_FAMILIES)[number];
