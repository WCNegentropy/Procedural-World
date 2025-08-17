export enum Biome {
  WATER = 0,
  SAND = 1,
  GRASS = 2,
  FOREST = 3,
  ROCK = 4,
  SNOW = 5,
  SAVANNAH = 6,
  SWAMP = 7,
}

export enum NPCType {
  WANDER = "wander",
  FORAGER = "forager",
  SCOUT = "scout",
  GUARD = "guard"
}

export enum NPCState {
  WANDERING = 'wandering',
  SEEKING_FOOD = 'seeking_food',
  HARVESTING = 'harvesting',
  PATROLLING = 'patrolling',
  FLEEING = 'fleeing',
  ATTACKING = 'attacking',
  RETURNING_HOME = 'returning_home',
}

export interface Prop {
  id: number;
  x: number; // Global Tile Coordinate
  y: number; // Global Tile Coordinate
  t: "shell" | "tree" | "rock" | "campfire" | "placed_wood" | "placed_stone";
  cooldown: number;
  stock: number;
}

export interface NPC {
  id: number;
  type: NPCType;
  x: number; // Global Continuous Coordinate
  y: number; // Global Continuous Coordinate
  dir: number;
  speed: number;
  energy: number;
  age: number;
  homeX: number; // Global Coordinate
  homeY: number; // Global Coordinate
  theta: number;
  hp: number;
  socialCd: number;
  gatherCd: number;
  state: NPCState;
  targetX: number | null;
  targetY: number | null;
  // New properties for advanced AI
  factionId: string;
  attackTargetId: number | null;
  attackCd: number;
  fleeTimeout: number;
  inventory: number;
}

export interface Player {
  x: number; // Global Continuous Coordinate
  y: number; // Global Continuous Coordinate
  dir: number;
  inventory: {
    wood: number;
    stone: number;
  };
}

export interface World {
  root: bigint;
  seeds: {
    hSeed: bigint;
    mSeed: bigint;
    pSeed: bigint;
    nSeed: bigint;
  };
  height: Float32Array;
  moist: Float32Array;
  biome: Uint8Array;
  props: Prop[];
  npcs: NPC[];
  playerSpawn: { x: number; y: number };
}

export type ViewMode = "biome" | "height" | "moisture";

export interface FeedbackMessage {
  id: number;
  text: string;
  x: number;
  y: number;
  age: number;
}