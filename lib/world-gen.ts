
import { PCG32, hashStringTo64BitBigInt, deriveSeed } from './prng';
import { makeGradientHash, fbm2D } from './noise';
import { World, Biome, Prop, NPC, NPCType, NPCState } from '../types';
import { MAP_W, MAP_H } from '../constants';
import { generateStructuresForChunk } from './structure-gen';
import { generateResourceClusters } from './resource-gen';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function generateChunk(seedStr: string, chunkX: number, chunkY: number, idCounters: { prop: number, npc: number }): World {
  const root = hashStringTo64BitBigInt(seedStr);
  const hSeed = deriveSeed(root, "HEIGHT");
  const mSeed = deriveSeed(root, "MOISTURE");
  const pSeed = deriveSeed(root, `PROPS:${chunkX},${chunkY}`);
  const nSeed = deriveSeed(root, `NPCS:${chunkX},${chunkY}`);
  const warpSeed = deriveSeed(root, "WARP");

  const hHash = makeGradientHash(hSeed);
  const mHash = makeGradientHash(mSeed);
  const warpHash = makeGradientHash(warpSeed);

  const height = new Float32Array(MAP_W * MAP_H);
  const moist = new Float32Array(MAP_W * MAP_H);
  const biome = new Uint8Array(MAP_W * MAP_H);

  // --- Multi-layered terrain generation parameters ---
  const continentalScale = 0.008; // Larger features for continents/oceans
  const terrainScale = 0.04;      // Smaller features for hills/mountains
  const warpScale = 0.05;         // Scale of the distortion noise
  const warpStrength = 80;        // How much to distort

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const globalX = chunkX * MAP_W + x;
      const globalY = chunkY * MAP_H + y;

      // Layer 3: Domain Warping (Perturbation)
      const warpXOffset = fbm2D(globalX * warpScale, globalY * warpScale, 2, 2.0, 0.5, warpHash);
      const warpYOffset = fbm2D((globalX + 500) * warpScale, (globalY - 300) * warpScale, 2, 2.0, 0.5, warpHash);
      const warpedX = globalX + (warpXOffset - 0.5) * warpStrength;
      const warpedY = globalY + (warpYOffset - 0.5) * warpStrength;

      // Layer 1: Continental Baseline
      const continentalValue = fbm2D(warpedX * continentalScale, warpedY * continentalScale, 4, 2.0, 0.5, hHash);
      
      // Layer 2: Terrain Features
      const terrainValue = fbm2D(warpedX * terrainScale, warpedY * terrainScale, 5, 2.0, 0.5, hHash);

      // Combine layers: The continental value forms the base, and the terrain value adds detail
      // especially at higher elevations, creating more realistic mountains.
      let h = continentalValue + (continentalValue * (terrainValue - 0.5) * 0.4);
      h = clamp01(h);
      
      // Moisture calculation (can also be warped for more natural rainfall patterns)
      const m = fbm2D(warpedX * terrainScale + 100, warpedY * terrainScale - 50, 4, 2.0, 0.55, mHash);

      const i = y * MAP_W + x;
      height[i] = h;
      moist[i] = m;
    }
  }

  // --- Biome Classification ---
  for (let i = 0; i < MAP_W * MAP_H; i++) {
    const h = height[i];
    const m = moist[i];
    let b = Biome.GRASS;
    
    // Adjusted thresholds for new generation method
    if (h < 0.45) b = Biome.WATER; // Raised sea level slightly for larger oceans
    else if (h < 0.48) b = Biome.SAND;
    else if (h > 0.82) b = Biome.SNOW;
    else if (h > 0.70) b = Biome.ROCK;
    else if (m > 0.55) {
        if (h < 0.5) b = Biome.SWAMP;
        else b = Biome.FOREST;
    } else if (m < 0.4) {
        b = Biome.SAVANNAH;
    } else {
        b = Biome.GRASS;
    }
    biome[i] = b;
  }

  const props: Prop[] = [];
  const rng = new PCG32(pSeed, pSeed ^ 0x5555n);
  
  const worldForProps: World = {
    root,
    seeds: { hSeed, mSeed, pSeed, nSeed },
    height, moist, biome, props, npcs: [],
    playerSpawn: { x: 0, y: 0 },
  };

  generateResourceClusters(worldForProps, chunkX, chunkY, rng, idCounters);

  const npcs: NPC[] = [];
  const rngN = new PCG32(nSeed, nSeed ^ 0x9999n);
  let attempts = 0;
  const npcCount = 25;
  const factionId = `${chunkX},${chunkY}`;

  while (npcs.length < npcCount && attempts < 3000) {
    const localX = Math.floor(rngN.nextFloat() * MAP_W);
    const localY = Math.floor(rngN.nextFloat() * MAP_H);
    const i = localY * MAP_W + localX;
    const b = biome[i];
    if (b !== Biome.WATER && b !== Biome.ROCK && b !== Biome.SNOW) {
      const r = rngN.nextFloat();
      const type = r < 0.4 ? NPCType.WANDER : r < 0.7 ? NPCType.FORAGER : r < 0.9 ? NPCType.SCOUT : NPCType.GUARD;
      const speed = type === NPCType.SCOUT ? 0.9 : type === NPCType.FORAGER ? 0.7 : type === NPCType.GUARD ? 0.5 : 0.6;
      const energy = 30 + Math.floor(rngN.nextFloat() * 30);
      
      const globalX = chunkX * MAP_W + localX;
      const globalY = chunkY * MAP_H + localY;

      const state = type === NPCType.FORAGER ? NPCState.WANDERING :
                    type === NPCType.GUARD ? NPCState.PATROLLING :
                    NPCState.WANDERING;

      npcs.push({ 
        id: idCounters.npc++, 
        type, 
        x: globalX + 0.5, y: globalY + 0.5, 
        dir: rngN.nextFloat() * Math.PI * 2, 
        speed, energy, age: 0, 
        homeX: globalX + 0.5, homeY: globalY + 0.5, 
        theta: rngN.nextFloat() * Math.PI * 2, 
        hp: 100, socialCd: 0, gatherCd: 0, 
        state,
        targetX: null, targetY: null,
        factionId,
        attackTargetId: null,
        attackCd: 0,
        fleeTimeout: 0,
        inventory: 0,
      });
    }
    attempts++;
  }

  const cx = Math.floor(MAP_W / 2), cy = Math.floor(MAP_H / 2);
  let spawn = { x: cx, y: cy };
  let bestD = Infinity;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      if (biome[i] !== Biome.WATER && biome[i] !== Biome.ROCK && biome[i] !== Biome.SNOW) {
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bestD) { bestD = d; spawn = { x, y }; }
      }
    }
  }

  const world: World = {
    root,
    seeds: { hSeed, mSeed, pSeed, nSeed },
    height, moist, biome, props: worldForProps.props, npcs,
    playerSpawn: { x: chunkX * MAP_W + spawn.x + 0.5, y: chunkY * MAP_H + spawn.y + 0.5 },
  };

  generateStructuresForChunk(world, chunkX, chunkY, root, idCounters);

  return world;
}
