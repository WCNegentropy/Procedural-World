
import { Biome, NPCType } from './types';

export const TILE = 6; // pixels per tile (base unit)
export const MAP_W = 128;
export const MAP_H = 128;
export const MAX_NPCS = 60; // cap to prevent unbounded growth

// Interaction tuning
export const INTERACT_R = 0.7;   // tiles: social/avoid radius
export const SEEK_R = 6;         // tiles: how far foragers look for resources
export const HARVEST_R = 0.6;    // tiles: harvest distance

export const BIOME_COLORS: Record<Biome, string> = {
  [Biome.WATER]: "#3a74b9",
  [Biome.SAND]: "#dacc8b",
  [Biome.GRASS]: "#5aa35a",
  [Biome.FOREST]: "#2f6b3a",
  [Biome.ROCK]: "#7d7d7d",
  [Biome.SNOW]: "#f0f4ff",
  [Biome.SAVANNAH]: "#a6b658",
  [Biome.SWAMP]: "#4a5d3a",
};

export const NPC_COLORS: Record<NPCType, string> = {
  [NPCType.WANDER]: "#ffed4a",
  [NPCType.FORAGER]: "#9df29d",
  [NPCType.SCOUT]: "#ffa1a1",
  [NPCType.GUARD]: "#caa8ff",
};