export type SURFACE =
  | "water"
  | "wetland"
  | "sand"
  | "mud"
  | "grass"
  | "dirt"
  | "gravel"
  | "cobblestone"
  | "stone"
  | "iron"
  | "steel";

export const SURFACE_HARDNESS: Record<SURFACE, number> = {
  water: 0,
  wetland: 0.1,
  sand: 0.2,
  mud: 0.3,
  grass: 0.4,
  dirt: 0.5,
  gravel: 0.6,
  cobblestone: 0.7,
  stone: 0.8,
  iron: 0.9,
  steel: 1,
};

// TODO for projections on impact, use the surface colour
export const SURFACE_COLOURS: Record<SURFACE, number> = {
  water: 0x00_ff_ff,
  wetland: 0x00_ff_ff,
  sand: 0x00_ff_ff,
  mud: 0x00_ff_ff,
  grass: 0x00_ff_ff,
  dirt: 0x00_ff_ff,
  gravel: 0x00_ff_ff,
  cobblestone: 0x00_ff_ff,
  stone: 0x00_ff_ff,
  iron: 0x00_ff_ff,
  steel: 0x00_ff_ff,
};
