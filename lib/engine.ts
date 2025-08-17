import { World, ViewMode, NPC, Player, Biome, Prop, NPCType, NPCState, FeedbackMessage } from '../types';
import { MAP_W, MAP_H, TILE, BIOME_COLORS, NPC_COLORS, MAX_NPCS, INTERACT_R, SEEK_R, HARVEST_R } from '../constants';
import { makeGradientHash, gradientNoise2D } from './noise';
import { PCG32 } from './prng';

let lastPropFrameTime = 0;
const propAnimState = {
    flicker: 0
};

function updatePropAnimations(time: number) {
    if (lastPropFrameTime === 0) lastPropFrameTime = time;
    const elapsed = time - lastPropFrameTime;
    propAnimState.flicker = (Math.sin(time / 200) + Math.sin(time / 350)) / 2;
    lastPropFrameTime = time;
}

export function drawWorld(ctx: CanvasRenderingContext2D, world: World, viewMode: ViewMode) {
  const { biome, height, moist } = world;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      let c: string;
      if (viewMode === "biome") {
        c = BIOME_COLORS[biome[i] as Biome];
      } else if (viewMode === "height") {
        const v = Math.floor(height[i] * 255);
        c = `rgb(${v},${v},${v})`;
      } else { // moisture
        const m = Math.floor(moist[i] * 255);
        c = `rgb(${Math.floor(255 - m / 2)},${m},${200})`;
      }
      ctx.fillStyle = c || "#000";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
}

export function drawProps(ctx: CanvasRenderingContext2D, props: Prop[], time: number) {
  updatePropAnimations(time);
  ctx.save();
  for (const p of props) {
    const localX = ((p.x % MAP_W) + MAP_W) % MAP_W;
    const localY = ((p.y % MAP_H) + MAP_H) % MAP_H;
    if (p.t === "tree") {
        const cx = localX * TILE + TILE / 2;
        const cy = localY * TILE + TILE / 2;
        // Trunk
        ctx.fillStyle = '#5c3c21';
        ctx.fillRect(cx - TILE * 0.1, cy + TILE * 0.1, TILE * 0.2, TILE * 0.4);
        // Canopy
        ctx.fillStyle = "#184d2c";
        ctx.beginPath();
        ctx.arc(cx, cy - TILE * 0.1, TILE * 0.35, 0, Math.PI * 2);
        ctx.fill();
    } else if (p.t === "rock") {
        const rockRng = new PCG32(BigInt(p.id));
        const cx = localX * TILE + TILE / 2;
        const cy = localY * TILE + TILE / 2;
        const radius = TILE * 0.35;
        const points = 5 + rockRng.nextUint32() % 2;

        ctx.fillStyle = "#6d6d6d";
        ctx.beginPath();
        ctx.moveTo(cx + radius, cy);
        for(let i=1; i <= points; i++) {
            const angle = (i/points) * Math.PI * 2;
            const r = radius * (0.8 + rockRng.nextFloat() * 0.4);
            ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
    } else if (p.t === "shell") {
      ctx.fillStyle = "#c9b87a";
      ctx.fillRect(localX * TILE + TILE * 0.3, localY * TILE + TILE * 0.3, TILE * 0.4, TILE * 0.4);
    } else if (p.t === "campfire") {
        const cx = localX * TILE + TILE / 2;
        const cy = localY * TILE + TILE / 2;
        // Logs
        ctx.fillStyle = '#4a2a0a';
        ctx.fillRect(cx - TILE*0.3, cy - TILE*0.1, TILE*0.6, TILE*0.2);
        ctx.fillRect(cx - TILE*0.1, cy - TILE*0.3, TILE*0.2, TILE*0.6);
        // Flicker
        const flickerSize = TILE * 0.2 + propAnimState.flicker * TILE * 0.05;
        ctx.fillStyle = `rgba(255, 220, 100, ${0.8 + propAnimState.flicker * 0.2})`;
        ctx.beginPath();
        ctx.arc(cx, cy, flickerSize, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 165, 0, ${0.7 + propAnimState.flicker * 0.3})`;
        ctx.beginPath();
        ctx.arc(cx, cy, flickerSize * 0.6, 0, Math.PI*2);
        ctx.fill();
    } else if (p.t === 'placed_wood') {
      ctx.fillStyle = '#5c3c21';
      ctx.fillRect(localX * TILE, localY * TILE, TILE, TILE);
    } else if (p.t === 'placed_stone') {
      ctx.fillStyle = '#808080';
      ctx.fillRect(localX * TILE, localY * TILE, TILE, TILE);
    }
  }
  ctx.restore();
}

export function drawLighting(ctx: CanvasRenderingContext2D, timeOfDay: number, lightSources: {x: number, y: number, radius: number}[], worldEnergy: number) {
    // timeOfDay is 0 (midnight) to 1 (next midnight)
    let darknessAlpha = 0;
    let color = `0, 0, 0`;

    const nightPeak = 0.5; // at what point in the cycle is it darkest
    const transitionWidth = 0.2; // how long is dawn/dusk

    const distFromPeak = Math.abs(timeOfDay - nightPeak);

    if (distFromPeak < transitionWidth) { // Night
        darknessAlpha = 0.85 * (1 - distFromPeak / transitionWidth);
        color = '5, 5, 40'; // Deep blue
    } else if (distFromPeak < transitionWidth + 0.1) { // Dusk/Dawn
        const progress = (distFromPeak - transitionWidth) / 0.1;
        darknessAlpha = 0.6 * (1 - progress);
        const r = 255 * (1 - progress) * 0.2;
        const g = 150 * (1 - progress) * 0.2;
        color = `${r}, ${g}, 10`; // Amber/Purple
    }

    if (darknessAlpha > 0) {
        ctx.save();
        // First, draw the darkness overlay
        ctx.fillStyle = `rgba(${color}, ${darknessAlpha})`;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Then, draw the light sources on top using an additive blend mode
        if(lightSources.length > 0) {
            ctx.globalCompositeOperation = 'lighter';
            for (const light of lightSources) {
                const grad = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
                
                // Create a fire-like glow gradient, incorporating flicker and world energy
                const flicker = 0.9 + propAnimState.flicker * 0.1;
                const energyBrightness = 0.6 + worldEnergy * 0.4; // scale from 0.6 to 1.0
                const finalBrightness = flicker * energyBrightness;

                grad.addColorStop(0,    `rgba(255, 220, 120, ${0.5 * finalBrightness})`);
                grad.addColorStop(0.25, `rgba(255, 180, 80, ${0.3 * finalBrightness})`);
                grad.addColorStop(0.5,  `rgba(200, 100, 20, ${0.1 * finalBrightness})`);
                grad.addColorStop(1,    `rgba(200, 100, 20, 0)`);
                
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}


export function drawNPCs(ctx: CanvasRenderingContext2D, npcs: NPC[]) {
  ctx.save();
  for (const n of npcs) {
    if (!n) continue;
    ctx.fillStyle = NPC_COLORS[n.type];
    const r = Math.max(0.18, Math.min(0.35, 0.22 + n.speed * 0.1)) * TILE;
    ctx.beginPath();
    ctx.arc(n.x * TILE, n.y * TILE, r, 0, Math.PI * 2);
    ctx.fill();

    // HP bar for Guards
    if (n.type === NPCType.GUARD) {
      const barWidth = TILE * 0.8;
      const barHeight = TILE * 0.1;
      ctx.fillStyle = '#dc2626'; // red
      ctx.fillRect(n.x * TILE - barWidth / 2, n.y * TILE - r - barHeight * 2, barWidth, barHeight);
      ctx.fillStyle = '#22c55e'; // green
      ctx.fillRect(n.x * TILE - barWidth / 2, n.y * TILE - r - barHeight * 2, barWidth * (n.hp / 100), barHeight);
    }
  }
  ctx.restore();
}

export function drawPlayer(ctx: CanvasRenderingContext2D, player: Player) {
  ctx.save();
  ctx.translate(player.x * TILE, player.y * TILE);
  ctx.rotate(player.dir || 0);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  const r = TILE * 0.35;
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.6, r * 0.6);
  ctx.lineTo(-r * 0.6, -r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawFeedbackMessages(ctx: CanvasRenderingContext2D, messages: FeedbackMessage[]) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `bold ${TILE*1.5}px sans-serif`;

    for(const msg of messages) {
        const life = msg.age / 0.8; // Lives for 0.8 seconds
        const yOffset = -(life * TILE * 2);
        const alpha = 1 - life;

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
        ctx.lineWidth = 2;

        ctx.strokeText(msg.text, msg.x * TILE, msg.y * TILE + yOffset);
        ctx.fillText(msg.text, msg.x * TILE, msg.y * TILE + yOffset);
    }
    ctx.restore();
}


function getChunkAndLocalCoords(globalX: number, globalY: number) {
    const chunkX = Math.floor(globalX / MAP_W);
    const chunkY = Math.floor(globalY / MAP_H);
    const localX = globalX - (chunkX * MAP_W);
    const localY = globalY - (chunkY * MAP_H);
    return { chunkX, chunkY, localX, localY };
}

export function isBlocked(chunks: Map<string, World>, propGrid: Map<string, Prop[]>, globalX: number, globalY: number): boolean {
  const xi = Math.floor(globalX);
  const yi = Math.floor(globalY);

  const { chunkX, chunkY, localX, localY } = getChunkAndLocalCoords(xi, yi);
  const chunkKey = `${chunkX},${chunkY}`;
  const chunk = chunks.get(chunkKey);

  if (!chunk) return false; // Optimistic: if chunk isn't loaded, assume it's not blocked

  const biome = chunk.biome[localY * MAP_W + localX];
  if (biome === Biome.WATER || biome === Biome.ROCK || biome === Biome.SNOW) {
    return true;
  }

  const gridKey = `${xi},${yi}`;
  const propsInTile = propGrid.get(gridKey);
  if (propsInTile) {
    for (const prop of propsInTile) {
      if (prop.t === 'placed_wood' || prop.t === 'placed_stone' || prop.t === 'campfire') {
        return true;
      }
    }
  }

  return false;
}

function nearestPropInChunks(allProps: Prop[], x: number, y: number, type: Prop['t'] | null, maxR: number = SEEK_R): Prop | null {
    let best: Prop | null = null;
    let bestD = Infinity;
    const r2 = maxR * maxR;
    for (const p of allProps) {
        if (p.cooldown > 0) continue;
        if (type && p.t !== type) continue;
        const dx = (p.x + 0.5) - x;
        const dy = (p.y + 0.5) - y;
        const d = dx * dx + dy * dy;
        if (d < bestD && d <= r2) {
            best = p;
            bestD = d;
        }
    }
    return best;
}

const findById = (npcs: NPC[], id: number | null) => id !== null ? npcs.find(n => n.id === id) : undefined;

export function updateNPCs(allNpcs: NPC[], allProps: Prop[], chunks: Map<string, World>, propGrid: Map<string, Prop[]>, dt: number, flowSeed: bigint) {
  const hash = makeGradientHash(flowSeed);
  
  for (const prop of allProps) {
    if (prop.cooldown > 0) prop.cooldown = Math.max(0, prop.cooldown - dt);
  }

  for (let idx = 0; idx < allNpcs.length; idx++) {
    const n = allNpcs[idx];
    if (!n || n.hp <= 0) continue;

    n.age += dt;
    n.energy -= (0.5 + (n.state === NPCState.ATTACKING ? 2 : 0)) * dt;
    n.socialCd = Math.max(0, n.socialCd - dt);
    n.attackCd = Math.max(0, n.attackCd - dt);
    n.fleeTimeout = Math.max(0, n.fleeTimeout - dt);
    
    let ang = n.dir;
    let move = true;

    if (n.type !== NPCType.GUARD && n.state !== NPCState.FLEEING) {
        let isThreatened = false;
        for (const other of allNpcs) {
            if (other.type === NPCType.GUARD && other.state === NPCState.ATTACKING && other.attackTargetId === n.id) {
                isThreatened = true;
                break;
            }
        }
        if (isThreatened) {
            n.state = NPCState.FLEEING;
            n.fleeTimeout = 5;
        }
    }

    if (n.type === NPCType.GUARD && n.state === NPCState.PATROLLING) {
        const patrolRadius = 8;
        for (const other of allNpcs) {
            if (other.factionId === n.factionId || other.hp <= 0) continue;
            const dx = other.x - n.x;
            const dy = other.y - n.y;
            if (dx*dx + dy*dy < patrolRadius * patrolRadius) {
                n.state = NPCState.ATTACKING;
                n.attackTargetId = other.id;
                break;
            }
        }
    }

    switch(n.state) {
      case NPCState.WANDERING:
        if (n.type === NPCType.FORAGER) {
            if (n.inventory >= 10) {
              n.state = NPCState.RETURNING_HOME;
            } else if (n.energy < 50) {
              const target = nearestPropInChunks(allProps, n.x, n.y, "tree", SEEK_R);
              if (target && target.stock > 0) {
                  n.state = NPCState.SEEKING_FOOD;
                  n.targetX = target.x + 0.5;
                  n.targetY = target.y + 0.5;
              }
            }
        }
        ang = gradientNoise2D(n.x * 0.2, n.y * 0.2, hash) * Math.PI * 4;
        break;

      case NPCState.PATROLLING:
        n.theta += dt * 0.8;
        const tx = n.homeX + Math.cos(n.theta) * 4.0;
        const ty = n.homeY + Math.sin(n.theta) * 4.0;
        ang = Math.atan2(ty - n.y, tx - n.x);
        break;

      case NPCState.SEEKING_FOOD:
        if (n.targetX !== null && n.targetY !== null) {
          const dx = n.targetX - n.x;
          const dy = n.targetY - n.y;
          if ((dx * dx + dy * dy) < (HARVEST_R * HARVEST_R)) {
            n.state = NPCState.HARVESTING;
            n.gatherCd = 3;
          } else {
            ang = Math.atan2(dy, dx);
          }
        } else {
          n.state = NPCState.WANDERING;
        }
        break;

      case NPCState.HARVESTING:
        move = false;
        n.gatherCd = Math.max(0, n.gatherCd - dt);
        if (n.gatherCd === 0) {
            const prop = nearestPropInChunks(allProps, n.x, n.y, "tree", 1.0);
            if (prop && prop.stock > 0) {
                prop.stock -= 1;
                prop.cooldown = 20;
                n.inventory += 1;
            }
            n.state = NPCState.WANDERING;
            n.targetX = null;
            n.targetY = null;
        }
        break;
      
      case NPCState.RETURNING_HOME:
        const hdx = n.homeX - n.x;
        const hdy = n.homeY - n.y;
        if (hdx*hdx + hdy*hdy < 1) {
            n.energy += n.inventory * 10;
            n.inventory = 0;
            n.state = NPCState.WANDERING;
        } else {
            ang = Math.atan2(hdy, hdx);
        }
        break;

      case NPCState.ATTACKING:
        const target = findById(allNpcs, n.attackTargetId);
        if (!target || target.hp <= 0 || target.factionId === n.factionId) {
            n.state = NPCState.PATROLLING;
            n.attackTargetId = null;
        } else {
            const adx = target.x - n.x;
            const ady = target.y - n.y;
            const d2 = adx*adx + ady*ady;
            ang = Math.atan2(ady, adx);
            if (d2 < 1.0 && n.attackCd === 0) {
                target.hp -= 15;
                n.attackCd = 1.5; // seconds
            }
        }
        break;

      case NPCState.FLEEING:
        if (n.fleeTimeout === 0) {
            n.state = NPCState.WANDERING;
        } else {
            let fleeX = 0, fleeY = 0;
            for (const other of allNpcs) {
                if (other.type === NPCType.GUARD && other.factionId !== n.factionId) {
                    const dx = n.x - other.x;
                    const dy = n.y - other.y;
                    const d2 = dx*dx + dy*dy;
                    if (d2 < 25) { // 5 tiles radius
                        fleeX += dx / (d2 + 0.1);
                        fleeY += dy / (d2 + 0.1);
                    }
                }
            }
            if (fleeX !== 0 || fleeY !== 0) {
                ang = Math.atan2(fleeY, fleeX);
            } else {
                move = false;
            }
        }
        break;
    }

    let sepX = 0, sepY = 0;
    for (const m of allNpcs) {
      if (n === m || !m) continue;
      const dx = n.x - m.x, dy = n.y - m.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < (INTERACT_R * INTERACT_R)) {
        const dist = Math.sqrt(d2);
        const mag = (INTERACT_R - dist) / INTERACT_R;
        sepX += (dx / dist) * mag;
        sepY += (dy / dist) * mag;
      }
    }
    if (sepX !== 0 || sepY !== 0) {
      const avoid = Math.atan2(sepY, sepX);
      const diff = Math.atan2(Math.sin(avoid - ang), Math.cos(avoid - ang));
      ang += diff * 0.2;
    }

    if (move) {
        const speed = n.speed;
        const nx = n.x + Math.cos(ang) * speed * dt;
        const ny = n.y + Math.sin(ang) * speed * dt;
        if (!isBlocked(chunks, propGrid, nx, ny)) {
          n.x = nx; n.y = ny; n.dir = ang;
        } else {
          n.dir += (hash(Math.floor(n.x * 7), Math.floor(n.y * 11)) - 0.5) * 1.2;
        }
    }
  }
  
  const aliveNpcs = allNpcs.filter(n => n && n.hp > 0 && n.energy > -5);
  allNpcs.length = 0;
  Array.prototype.push.apply(allNpcs, aliveNpcs);
}