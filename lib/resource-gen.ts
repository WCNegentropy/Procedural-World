
import { PCG32 } from './prng';
import { World, Biome, Prop } from '../types';
import { MAP_W, MAP_H } from '../constants';

type IdCounters = { prop: number, npc: number };

export function generateResourceClusters(world: World, chunkX: number, chunkY: number, rng: PCG32, idCounters: IdCounters) {
    const clusterAttempts = 30; // More clusters
    const occupied = new Set<string>();

    for (let i = 0; i < clusterAttempts; i++) {
        const cx = rng.nextUint32() % MAP_W;
        const cy = rng.nextUint32() % MAP_H;
        const biome = world.biome[cy * MAP_W + cx];

        let propType: Prop['t'] | null = null;
        let clusterSize = 0;
        let density = 0;

        switch (biome) {
            case Biome.FOREST:
            case Biome.SWAMP:
                propType = 'tree';
                clusterSize = 8 + rng.nextUint32() % 15; // Bigger clusters
                density = 0.5;
                break;
            case Biome.SAVANNAH:
                propType = 'rock';
                clusterSize = 6 + rng.nextUint32() % 10; // Bigger clusters
                density = 0.6;
                break;
            case Biome.GRASS:
                propType = rng.nextFloat() < 0.5 ? 'tree' : 'rock';
                clusterSize = 4 + rng.nextUint32() % 5;
                density = 0.3;
                break;
            case Biome.SAND:
                propType = 'shell';
                clusterSize = 10 + rng.nextUint32() % 15;
                density = 0.2;
                break;
        }

        if (!propType) continue;

        for (let j = 0; j < clusterSize; j++) {
            const angle = rng.nextFloat() * Math.PI * 2;
            const radius = Math.pow(rng.nextFloat(), 2) * 8; // Skew towards center
            const px = Math.floor(cx + Math.cos(angle) * radius);
            const py = Math.floor(cy + Math.sin(angle) * radius);

            if (px < 0 || px >= MAP_W || py < 0 || py >= MAP_H) continue;
            
            const key = `${px},${py}`;
            if (occupied.has(key)) continue;

            const currentBiome = world.biome[py * MAP_W + px];
            if (currentBiome !== biome && propType !== 'shell') continue; // Allow shells to spill onto grass
            if (currentBiome === Biome.WATER || currentBiome === Biome.ROCK || currentBiome === Biome.SNOW) continue;

            if (rng.nextFloat() < density) {
                const stock = propType === 'tree' ? 3 : propType === 'rock' ? 2 : 0;
                const globalX = chunkX * MAP_W + px;
                const globalY = chunkY * MAP_H + py;
                world.props.push({ id: idCounters.prop++, x: globalX, y: globalY, t: propType, cooldown: 0, stock });
                occupied.add(key);
            }
        }
    }
}
