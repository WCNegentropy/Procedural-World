import { PCG32, deriveSeed } from './prng';
import { World, Biome, Prop } from '../types';
import { MAP_W, MAP_H } from '../constants';

type IdCounters = { prop: number, npc: number };

/**
 * Checks if a given area within a chunk is suitable for building a structure.
 * It checks for flat ground, an appropriate biome, and no existing props.
 */
function isAreaSuitable(world: World, chunkX: number, chunkY: number, localX: number, localY: number, width: number, height: number): boolean {
    if (localX < 0 || localY < 0 || localX + width >= MAP_W || localY + height >= MAP_H) return false;

    const baseHeight = world.height[localY * MAP_W + localX];
    const baseBiome = world.biome[localY * MAP_W + localX];

    if (baseBiome !== Biome.GRASS && baseBiome !== Biome.SAVANNAH) {
        return false;
    }

    for (let y = localY; y < localY + height; y++) {
        for (let x = localX; x < localX + width; x++) {
            const i = y * MAP_W + x;

            const biome = world.biome[i];
            if (biome === Biome.WATER || biome === Biome.ROCK || biome === Biome.SNOW || biome === Biome.SWAMP) {
                return false;
            }

            if (Math.abs(world.height[i] - baseHeight) > 0.05) {
                return false;
            }

            const globalX = chunkX * MAP_W + x;
            const globalY = chunkY * MAP_H + y;
            if (world.props.some(p => p.x === globalX && p.y === globalY)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Generates a small, ruined stone structure.
 */
function generateRuin(world: World, globalX: number, globalY: number, rng: PCG32, idCounters: IdCounters) {
    const width = 3 + rng.nextUint32() % 4;
    const height = 3 + rng.nextUint32() % 4;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                if (rng.nextFloat() > 0.25) {
                    world.props.push({
                        id: idCounters.prop++,
                        t: 'placed_stone',
                        x: globalX + x,
                        y: globalY + y,
                        stock: 0,
                        cooldown: 0
                    });
                }
            }
        }
    }
}

/**
 * Generates an abandoned campsite.
 */
function generateCamp(world: World, globalX: number, globalY: number, idCounters: IdCounters) {
    world.props.push({ id: idCounters.prop++, t: 'campfire', x: globalX + 1, y: globalY + 1, stock: 0, cooldown: 0 });
    world.props.push({ id: idCounters.prop++, t: 'placed_wood', x: globalX, y: globalY - 1, stock: 0, cooldown: 0 });
    world.props.push({ id: idCounters.prop++, t: 'placed_wood', x: globalX + 2, y: globalY - 1, stock: 0, cooldown: 0 });
}

/**
 * Generates a small hut structure.
 */
function generateHut(world: World, globalX: number, globalY: number, rng: PCG32, idCounters: IdCounters) {
    const width = 3;
    const height = 3;
    const doorPos = 1 + rng.nextUint32() % (width - 2);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                if (y === height - 1 && x === doorPos) continue; 
                world.props.push({
                    id: idCounters.prop++,
                    t: 'placed_wood',
                    x: globalX + x,
                    y: globalY + y,
                    stock: 0,
                    cooldown: 0
                });
            }
        }
    }
}

/**
 * Generates a small village with multiple huts.
 */
function generateVillage(world: World, globalX: number, globalY: number, rng: PCG32, idCounters: IdCounters) {
    const numHuts = 2 + rng.nextUint32() % 3;
    for (let i = 0; i < numHuts; i++) {
        const hutOffsetX = rng.nextUint32() % 8;
        const hutOffsetY = rng.nextUint32() % 8;
        
        const hutGlobalX = globalX + hutOffsetX;
        const hutGlobalY = globalY + hutOffsetY;

        const isOccupied = world.props.some(p => 
            p.x >= hutGlobalX && p.x < hutGlobalX + 3 &&
            p.y >= hutGlobalY && p.y < hutGlobalY + 3
        );

        if (!isOccupied) {
             generateHut(world, hutGlobalX, hutGlobalY, rng, idCounters);
        }
    }
}

export function generateStructuresForChunk(world: World, chunkX: number, chunkY: number, rootSeed: bigint, idCounters: IdCounters) {
    const structSeed = deriveSeed(rootSeed, `STRUCTURES:${chunkX},${chunkY}`);
    const rng = new PCG32(structSeed, structSeed ^ 0xabcdefn);

    const attempts = 5;

    for (let i = 0; i < attempts; i++) {
        const localX = rng.nextUint32() % (MAP_W - 12); // Padding for largest structure
        const localY = rng.nextUint32() % (MAP_H - 12);
        
        const structureType = rng.nextFloat();
        
        if (structureType < 0.1) { // 10% chance for a Village
            if (isAreaSuitable(world, chunkX, chunkY, localX, localY, 12, 12)) {
                generateVillage(world, chunkX * MAP_W + localX, chunkY * MAP_H + localY, rng, idCounters);
                return; // Only one major structure per chunk
            }
        } else if (structureType < 0.5) { // 40% chance for a Ruin
            if (isAreaSuitable(world, chunkX, chunkY, localX, localY, 7, 7)) {
                generateRuin(world, chunkX * MAP_W + localX, chunkY * MAP_H + localY, rng, idCounters);
            }
        } else { // 50% chance for a Camp
             if (isAreaSuitable(world, chunkX, chunkY, localX, localY, 3, 3)) {
                generateCamp(world, chunkX * MAP_W + localX, chunkY * MAP_H + localY, idCounters);
            }
        }
    }
}