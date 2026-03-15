import type { SoaParticleEngine } from '@zakkster/lite-soa-particle-engine';
import type Random from '@zakkster/lite-random';
import type { OklchColor } from '@zakkster/lite-color';

// Force Fields
export declare class Wind { constructor(fx: number, fy: number); fx: number; fy: number; enabled: boolean; apply(dt: number, x: Float32Array, y: Float32Array, vx: Float32Array, vy: Float32Array, life: Float32Array, max: number): void; }
export declare class GravityWell { constructor(px: number, py: number, strength: number, radius?: number); px: number; py: number; strength: number; radius: number; enabled: boolean; apply(dt: number, x: Float32Array, y: Float32Array, vx: Float32Array, vy: Float32Array, life: Float32Array, max: number): void; }
export declare class Vortex { constructor(px: number, py: number, strength: number, pull?: number, radius?: number); px: number; py: number; strength: number; pull: number; radius: number; enabled: boolean; apply(dt: number, x: Float32Array, y: Float32Array, vx: Float32Array, vy: Float32Array, life: Float32Array, max: number): void; }
export declare class Turbulence { constructor(strength: number, scale?: number, speed?: number); strength: number; scale: number; speed: number; enabled: boolean; apply(dt: number, x: Float32Array, y: Float32Array, vx: Float32Array, vy: Float32Array, life: Float32Array, max: number): void; }
export declare class DragField { constructor(factor?: number); factor: number; enabled: boolean; apply(dt: number, x: Float32Array, y: Float32Array, vx: Float32Array, vy: Float32Array, life: Float32Array, max: number): void; }

// Emitter Shapes
export declare const EmitterShape: {
    point(): { x: number; y: number };
    circle(radius: number, rng: Random): { x: number; y: number };
    ring(radius: number, rng: Random): { x: number; y: number };
    line(width: number, rng: Random): { x: number; y: number };
    rect(w: number, h: number, rng: Random): { x: number; y: number };
    rectEdge(w: number, h: number, rng: Random): { x: number; y: number };
};

// Recipes
export interface FXRecipe {
    id?: number;
    count: [number, number];
    life: [number, number];
    speed: [number, number];
    angle: [number, number];
    gravity: number;
    friction: number;
    size: [number, number];
    colorFn: (progress: number) => OklchColor;
    blendMode?: GlobalCompositeOperation;
    shape?: 'rect' | 'circle';
}

export declare const Presets: {
    fire: () => FXRecipe; smoke: () => FXRecipe; sparks: () => FXRecipe;
    explosion: () => FXRecipe; magic: () => FXRecipe; rain: () => FXRecipe;
    snow: () => FXRecipe; confetti: () => FXRecipe;
};

export interface FXSpawnOptions {
    shape?: (rng: Random) => { x: number; y: number };
    rng?: Random;
}

export declare class FXSystem {
    readonly engine: SoaParticleEngine;
    readonly rng: Random;
    readonly isRunning: boolean;
    readonly aliveCount: number;
    debug: boolean;
    forces: Array<{ apply: Function; enabled: boolean }>;

    constructor(ctx: CanvasRenderingContext2D, options?: { maxParticles?: number; seed?: number; debug?: boolean });
    register(recipeOrPreset: FXRecipe | (() => FXRecipe)): Readonly<FXRecipe>;
    addForce(force: { apply: Function }): () => void;
    spawn(x: number, y: number, recipe: FXRecipe, options?: FXSpawnOptions): void;
    burst(x: number, y: number, presetFn: () => FXRecipe, options?: FXSpawnOptions): Readonly<FXRecipe>;
    start(): void; stop(): void; pause(): void; clear(): void;
    resetSeed(seed?: number): void;
    destroy(): void;
}

export default FXSystem;
