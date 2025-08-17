
import React, { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { useKeys } from '../hooks/useKeys';
import { generateChunk } from '../lib/world-gen';
import { drawWorld, drawProps, drawNPCs, drawPlayer, isBlocked, updateNPCs, drawLighting, drawFeedbackMessages } from '../lib/engine';
import { deriveSeed } from "../lib/prng";
import { MAP_W, MAP_H, TILE } from '../constants';
import type { World, Player, ViewMode, NPC, Prop, FeedbackMessage } from '../types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const ControlPanel: React.FC<{
  seedStr: string;
  setSeedStr: React.Dispatch<React.SetStateAction<string>>;
  running: boolean;
  setRunning: React.Dispatch<React.SetStateAction<boolean>>;
  view: ViewMode;
  setView: React.Dispatch<React.SetStateAction<ViewMode>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  player: Player;
  worldEnergy: number;
}> = memo(({ seedStr, setSeedStr, running, setRunning, view, setView, zoom, setZoom, player, worldEnergy }) => {
  return (
    <div className="col-span-12 lg:col-span-3 space-y-4 p-4 h-full overflow-y-auto">
      <h1 className="text-2xl font-bold text-white">Procedural World</h1>
      <p className="text-sm text-slate-400">An infinitely explorable, procedurally generated world.</p>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300 block">Root Seed</label>
        <input
          value={seedStr}
          onChange={(e) => setSeedStr(e.target.value)}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-white outline-none ring-1 ring-slate-700 focus:ring-sky-500 transition-shadow"
          placeholder="enter a seed"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setSeedStr((s) => s + "*")}
            className="flex-1 px-3 py-2 rounded-md bg-sky-600 text-white font-semibold hover:bg-sky-500 transition-colors"
          >New World</button>
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex-1 px-3 py-2 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-500 transition-colors"
          >{running ? "Pause" : "Resume"}</button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300 block">View Mode</label>
        <div className="grid grid-cols-3 gap-2">
          {(["biome", "height", "moisture"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setView(m)}
              className={`capitalize w-full px-3 py-2 rounded-md transition-colors text-white font-semibold ${view === m ? "bg-emerald-600" : "bg-slate-700 hover:bg-slate-600"}`}
            >{m}</button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300 block">Zoom</label>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} className="px-3 py-1.5 rounded-md bg-slate-700 text-white hover:bg-slate-600">-</button>
          <div className="flex-1 text-center font-mono text-white bg-slate-800 rounded-md py-1.5">{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom((z) => Math.min(3.0, +(z + 0.1).toFixed(2)))} className="px-3 py-1.5 rounded-md bg-slate-700 text-white hover:bg-slate-600">+</button>
        </div>
      </div>

      <div className="p-3 rounded-md bg-slate-800 ring-1 ring-slate-700/50 space-y-2">
        <h3 className="font-semibold text-white">Player Info</h3>
        <div className="text-xs text-slate-300">
           <span className="font-semibold text-slate-300">Coords:</span> {player.x.toFixed(1)}, {player.y.toFixed(1)}
        </div>
         <div className="text-xs text-slate-300">
           <span className="font-semibold text-slate-300">Wood:</span> {player.inventory.wood} / 99
        </div>
        <div className="text-xs text-slate-300">
           <span className="font-semibold text-slate-300">Stone:</span> {player.inventory.stone} / 99
        </div>
        <div className="text-xs text-slate-300">
           <span className="font-semibold text-slate-300">World Energy:</span> {Math.round(worldEnergy * 100)}%
        </div>
      </div>

      <div className="text-xs leading-5 text-slate-400 space-y-2 pt-4 border-t border-slate-700/50">
        <div><span className="font-semibold text-slate-300">Move:</span> WASD/Arrows. Hold Shift to sprint.</div>
        <div><span className="font-semibold text-slate-300">Interact:</span> 'E' to harvest/pickup.</div>
        <div><span className="font-semibold text-slate-300">Build:</span> '1' Wood Block, '2' Stone Block, 'B' Campfire (5 wood).</div>
        <div><span className="font-semibold text-slate-300">NPC AI:</span> NPCs have factions. Guards attack other factions. Foragers gather resources. Others flee from danger.</div>
        <div><span className="font-semibold text-slate-300">Structures:</span> Discover procedurally generated ruins and camps.</div>
      </div>
    </div>
  );
});


export default function ProceduralEngine() {
  const [seedStr, setSeedStr] = useState("gemini-canvas-poc");
  const [view, setView] = useState<ViewMode>("biome");
  const [running, setRunning] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  
  const [activeChunks, setActiveChunks] = useState<Map<string, World>>(new Map());
  const [allNpcs, setAllNpcs] = useState<NPC[]>([]);
  const [allProps, setAllProps] = useState<Prop[]>([]);
  const [worldMeta, setWorldMeta] = useState<{root: bigint | null}>({ root: null });
  const [globalTime, setGlobalTime] = useState(60); // Start at morning
  const [worldEnergy, setWorldEnergy] = useState(0);
  const [feedbackMessages, setFeedbackMessages] = useState<FeedbackMessage[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldLayersRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const propsLayersRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const playerRef = useRef<Player>({ x: 0, y: 0, dir: 0, inventory: { wood: 0, stone: 0 } });
  const cameraRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const idCountersRef = useRef({ prop: 0, npc: 0, feedback: 0 });

  const propGrid = useMemo(() => {
    const grid = new Map<string, Prop[]>();
    for (const prop of allProps) {
        if (prop.t === 'placed_wood' || prop.t === 'placed_stone' || prop.t === 'campfire') {
            const key = `${prop.x},${prop.y}`;
            if (!grid.has(key)) {
                grid.set(key, []);
            }
            grid.get(key)!.push(prop);
        }
    }
    return grid;
  }, [allProps]);
  
  const addFeedback = useCallback((text: string) => {
    const p = playerRef.current;
    setFeedbackMessages(prev => [...prev, {
      id: idCountersRef.current.feedback++,
      text,
      x: p.x,
      y: p.y - 0.5, // Start slightly above player
      age: 0
    }]);
  }, []);

  const handleKeyPress = useCallback((key: string) => {
    const p = playerRef.current;

    if (key === 'e') { // Harvest or Pick up
      let closestDist = Infinity;
      let closestProp: Prop | null = null;
      // Check only nearby props for efficiency
      const searchRadius = 2;
      for(const prop of allProps) {
        const dx = p.x - (prop.x + 0.5);
        const dy = p.y - (prop.y + 0.5);
        if (Math.abs(dx) > searchRadius || Math.abs(dy) > searchRadius) continue;

        const dist = Math.hypot(dx, dy);
        if (dist < closestDist) {
          closestDist = dist;
          closestProp = prop;
        }
      }

      if (closestProp && closestDist < 1.2) {
        const targetPropId = closestProp.id;
        if (closestProp.t === 'tree') {
            if (p.inventory.wood >= 99) {
                addFeedback("Wood inventory full!");
                return;
            }
            if (closestProp.stock > 0) {
              setAllProps(prev => prev.map(pr => pr.id === targetPropId ? {...pr, stock: pr.stock - 1} : pr));
              p.inventory.wood = Math.min(99, p.inventory.wood + 1);
            }
        } else if (closestProp.t === 'rock') {
            if (p.inventory.stone >= 99) {
                addFeedback("Stone inventory full!");
                return;
            }
            if (closestProp.stock > 0) {
              setAllProps(prev => prev.map(pr => pr.id === targetPropId ? {...pr, stock: pr.stock - 1} : pr));
              p.inventory.stone = Math.min(99, p.inventory.stone + 1);
            }
        } else if (closestProp.t === 'placed_wood') {
          p.inventory.wood = Math.min(99, p.inventory.wood + 1);
          setAllProps(prev => prev.filter(pr => pr.id !== targetPropId));
        } else if (closestProp.t === 'placed_stone') {
          p.inventory.stone = Math.min(99, p.inventory.stone + 1);
          setAllProps(prev => prev.filter(pr => pr.id !== targetPropId));
        }
      }
    } 
    
    const handleBuild = (itemType: Prop['t'], cost: { wood?: number, stone?: number }) => {
        // Check inventory
        if (cost.wood && p.inventory.wood < cost.wood) {
            addFeedback("Not enough wood!");
            return;
        }
        if (cost.stone && p.inventory.stone < cost.stone) {
            addFeedback("Not enough stone!");
            return;
        }

        // Calculate target tile in front of player
        const dx = Math.round(Math.cos(p.dir));
        const dy = Math.round(Math.sin(p.dir));
        const targetX = Math.floor(p.x) + dx;
        const targetY = Math.floor(p.y) + dy;

        // Prevent placing on self if player hasn't moved yet
        if (targetX === Math.floor(p.x) && targetY === Math.floor(p.y)) {
            addFeedback("Move to set a build direction!");
            return;
        }

        // Check if target tile is valid
        if (isBlocked(activeChunks, propGrid, targetX + 0.5, targetY + 0.5)) {
            addFeedback("Can't build there!");
            return;
        }

        // Deduct cost
        if (cost.wood) p.inventory.wood -= cost.wood;
        if (cost.stone) p.inventory.stone -= cost.stone;
        
        // Create new prop
        const newProp: Prop = {
            id: idCountersRef.current.prop++,
            x: targetX,
            y: targetY,
            t: itemType,
            cooldown: 0,
            stock: 0
        };

        setAllProps(prev => [...prev, newProp]);
    };

    if (key === 'b') { // Build Campfire
      handleBuild('campfire', { wood: 5 });
    } else if (key === '1') { // Place Wood Block
      handleBuild('placed_wood', { wood: 1 });
    } else if (key === '2') { // Place Stone Block
      handleBuild('placed_stone', { stone: 1 });
    }
  }, [allProps, addFeedback, activeChunks, propGrid]);

  const keys = useKeys(handleKeyPress);
  
  const playerChunkX = Math.floor(playerRef.current.x / MAP_W);
  const playerChunkY = Math.floor(playerRef.current.y / MAP_H);

  const resetWorld = useCallback(() => {
    setActiveChunks(new Map());
    setAllNpcs([]);
    setAllProps([]);
    worldLayersRef.current.clear();
    propsLayersRef.current.clear();
    const initialPlayerState = { x: 0, y: 0, dir: 0, inventory: { wood: 0, stone: 0 }};
    playerRef.current = initialPlayerState; 
    cameraRef.current = {x: 0, y: 0};
    idCountersRef.current = { prop: 0, npc: 0, feedback: 0 };
  }, []);

  useEffect(() => {
    resetWorld();
  }, [seedStr, resetWorld]);
  
  useEffect(() => {
    let isMounted = true;
    const neededChunks = new Set<string>();
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        neededChunks.add(`${playerChunkX + x},${playerChunkY + y}`);
      }
    }

    const newChunks = new Map(activeChunks);
    let chunksChanged = false;

    for (const key of neededChunks) {
      if (!newChunks.has(key)) {
        const [cx, cy] = key.split(',').map(Number);
        const chunk = generateChunk(seedStr, cx, cy, idCountersRef.current);
        newChunks.set(key, chunk);
        chunksChanged = true;
        if(worldMeta.root === null) setWorldMeta({ root: chunk.root });

        if(playerRef.current.x === 0 && playerRef.current.y === 0) {
          const spawnPoint = { ...chunk.playerSpawn, dir: 0, inventory: { wood: 0, stone: 0 } };
          playerRef.current = spawnPoint;
          cameraRef.current = { x: spawnPoint.x, y: spawnPoint.y };
        }
      }
    }

    // Pruning logic for props and NPCs
    const playerProps = allProps.filter(p => p.t.startsWith('placed_') || p.t === 'campfire');

    for (const key of activeChunks.keys()) {
      if (!neededChunks.has(key)) {
        newChunks.delete(key);
        worldLayersRef.current.delete(key);
        propsLayersRef.current.delete(key);
        chunksChanged = true;
      }
    }

    if (chunksChanged) {
        if (!isMounted) return;
        setActiveChunks(newChunks);

        // Rebuild props and NPCs from the ground up
        const generatedNpcs = Array.from(newChunks.values()).flatMap(chunk => chunk.npcs);
        const generatedProps = Array.from(newChunks.values()).flatMap(chunk => chunk.props);
        
        // Combine with player props, ensuring player props in active chunks are kept
        const activePlayerProps = playerProps.filter(p => {
          const pChunkKey = `${Math.floor(p.x / MAP_W)},${Math.floor(p.y / MAP_H)}`;
          return neededChunks.has(pChunkKey);
        });

        const finalProps = [...generatedProps];
        const generatedIds = new Set(generatedProps.map(p => p.id));
        for(const p of activePlayerProps) {
            if (!generatedIds.has(p.id)) {
                finalProps.push(p);
            }
        }

        setAllNpcs(generatedNpcs);
        setAllProps(finalProps);
    }
    return () => { isMounted = false; };
  }, [seedStr, playerChunkX, playerChunkY, allProps]);

  useEffect(() => {
    // Clear the entire props cache whenever allProps changes.
    // This is simpler and more robust than invalidating individual chunks.
    propsLayersRef.current.clear();
    for (const [key, chunk] of activeChunks.entries()) {
      // Re-cache world layer if view mode changes
      const worldCacheKey = `${key}-${view}`;
      if (!worldLayersRef.current.has(worldCacheKey)) {
        const canvas = document.createElement('canvas');
        canvas.width = MAP_W * TILE; canvas.height = MAP_H * TILE;
        const ctx = canvas.getContext('2d');
        if (ctx) drawWorld(ctx, chunk, view);
        worldLayersRef.current.set(worldCacheKey, canvas);
      }
    }
  }, [activeChunks, view, allProps]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || worldMeta.root === null) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    let lastTime = performance.now();
    let isLooping = true;
    const flowSeed = deriveSeed(worldMeta.root, "FLOW");
    const DAY_LENGTH_SECONDS = 240;
    const ENERGY_CYCLE_SECONDS = 60;
    
    // To trigger re-render of panel
    let frameCount = 0;

    const frame = (time: number) => {
      if (!isLooping) return;
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      if (running) {
        // --- UPDATE LOGIC ---
        const newGlobalTime = globalTime + dt;
        setGlobalTime(newGlobalTime);
        setWorldEnergy((Math.sin(newGlobalTime * (2 * Math.PI / ENERGY_CYCLE_SECONDS)) + 1) / 2);

        setFeedbackMessages(prev =>
          prev.map(m => ({ ...m, age: m.age + dt })).filter(m => m.age < 0.8)
        );

        const p = playerRef.current;
        const isSprinting = keys.current.has("shift");
        const speed = (isSprinting ? 8.0 : 4.0);
        let vx = 0, vy = 0;
        if (keys.current.has("w") || keys.current.has("arrowup")) vy -= 1;
        if (keys.current.has("s") || keys.current.has("arrowdown")) vy += 1;
        if (keys.current.has("a") || keys.current.has("arrowleft")) vx -= 1;
        if (keys.current.has("d") || keys.current.has("arrowright")) vx += 1;
        
        if(vx !== 0 || vy !== 0) {
            const mag = Math.hypot(vx, vy);
            const moveSpeed = speed * dt;
            const nx = p.x + (vx / mag) * moveSpeed;
            const ny = p.y + (vy / mag) * moveSpeed;
            if (!isBlocked(activeChunks, propGrid, nx, ny)) {
                p.x = nx;
                p.y = ny;
            }
            p.dir = Math.atan2(vy, vx);
        }
        
        updateNPCs(allNpcs, allProps, activeChunks, propGrid, dt, flowSeed);
      }
      
      // --- RENDER LOGIC ---
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const cssW = rect.width, cssH = rect.height;
      const viewW = Math.floor(cssW * dpr), viewH = Math.floor(cssH * dpr);

      if (canvas.width !== viewW || canvas.height !== viewH) {
        canvas.width = viewW; canvas.height = viewH;
      }
      
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, viewW, viewH);

      // Smooth Camera
      cameraRef.current.x = lerp(cameraRef.current.x, playerRef.current.x, 0.1);
      cameraRef.current.y = lerp(cameraRef.current.y, playerRef.current.y, 0.1);

      const camX = cameraRef.current.x * TILE;
      const camY = cameraRef.current.y * TILE;
      
      ctx.translate(viewW / 2, viewH / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      for (const [key, chunk] of activeChunks.entries()) {
        const [cx, cy] = key.split(',').map(Number);
        const worldCacheKey = `${key}-${view}`;
        const worldLayer = worldLayersRef.current.get(worldCacheKey);

        const offsetX = cx * MAP_W * TILE;
        const offsetY = cy * MAP_H * TILE;
        if(worldLayer) ctx.drawImage(worldLayer, offsetX, offsetY);
        
        // Rebuild prop cache on the fly if it doesn't exist
        let propsLayer = propsLayersRef.current.get(key);
        if (!propsLayer) {
            const propsForChunk = allProps.filter(p => {
                const pChunkX = Math.floor(p.x / MAP_W);
                const pChunkY = Math.floor(p.y / MAP_H);
                return `${pChunkX},${pChunkY}` === key;
            });
            const propsCanvas = document.createElement('canvas');
            propsCanvas.width = MAP_W * TILE; propsCanvas.height = MAP_H * TILE;
            const propsCtx = propsCanvas.getContext('2d');
            if (propsCtx) drawProps(propsCtx, propsForChunk, time);
            propsLayersRef.current.set(key, propsCanvas);
            propsLayer = propsCanvas;
        }
        if (propsLayer) ctx.drawImage(propsLayer, offsetX, offsetY);
      }
      
      drawNPCs(ctx, allNpcs);
      drawFeedbackMessages(ctx, feedbackMessages);
      drawPlayer(ctx, playerRef.current);
     
      ctx.restore(); 
      const lightSources = allProps.filter(p => p.t === 'campfire');
      const timeOfDay = (globalTime % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;

      const screenLightSources = lightSources.map(p => ({
          x: Math.round((p.x * TILE + TILE / 2 - camX) * zoom + viewW / 2),
          y: Math.round((p.y * TILE + TILE / 2 - camY) * zoom + viewH / 2),
          radius: Math.round(TILE * 8 * zoom),
      }));

      drawLighting(ctx, timeOfDay, screenLightSources, worldEnergy);
      
      // Force panel update
      frameCount++;
      if (frameCount % 10 === 0) {
        setRunning(r => r);
      }
      
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      isLooping = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [running, zoom, keys, worldMeta.root, activeChunks, allNpcs, allProps, propGrid, view, globalTime, worldEnergy, feedbackMessages]);
  
  const [playerForPanel, setPlayerForPanel] = useState(playerRef.current);
  useEffect(()=>{
    const interval = setInterval(()=>{
        setPlayerForPanel({...playerRef.current})
    }, 100);
    return ()=>clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full grid grid-cols-12 bg-slate-900 font-sans">
      <div className="col-span-12 lg:col-span-9 flex items-center justify-center bg-black/20 p-2 md:p-4">
        <div className="w-full h-full rounded-lg overflow-hidden shadow-2xl ring-1 ring-slate-700/50">
          <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
      </div>
      <ControlPanel 
        seedStr={seedStr} setSeedStr={setSeedStr}
        running={running} setRunning={setRunning}
        view={view} setView={setView}
        zoom={zoom} setZoom={setZoom}
        player={playerForPanel}
        worldEnergy={worldEnergy}
      />
    </div>
  );
}
