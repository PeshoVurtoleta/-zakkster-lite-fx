/**
 * @zakkster/lite-fx — A Complete Web VFX Engine
 *
 * Deterministic, zero-GC, OKLCH-native particle effects.
 *
 * Composes:
 *   @zakkster/lite-soa-particle-engine  (SoA TypedArray core)
 *   @zakkster/lite-color                (OKLCH interpolation)
 *   @zakkster/lite-lerp                 (math primitives)
 *   @zakkster/lite-random               (deterministic RNG)
 *
 * Architecture:
 *   FXSystem    → orchestrator: owns engine, forces, recipes, renderer
 *   ForceField  → modifies velocity arrays each frame (Wind, GravityWell, Vortex, Turbulence, DragField)
 *   EmitterShape → distributes spawn positions (point, circle, line, ring, rect, rectEdge)
 *   Presets     → frozen recipe factories for common effects
 */

import { SoaParticleEngine } from '@zakkster/lite-soa-particle-engine';
import { createGradient, toCssOklch } from '@zakkster/lite-color';
import { lerp, clamp, easeOut, easeIn, easeInOut } from '@zakkster/lite-lerp';
import Random from '@zakkster/lite-random';


// ═══════════════════════════════════════════════════════════
//  FORCE FIELDS
// ═══════════════════════════════════════════════════════════

/** Constant directional force (wind, global gravity). */
export class Wind {
    constructor(fx, fy) {
        this.fx = fx;
        this.fy = fy;
        this.enabled = true;
    }

    apply(dt, x, y, vx, vy, life, max) {
        if (!this.enabled) return;
        const dfx = this.fx * dt;
        const dfy = this.fy * dt;
        for (let i = 0; i < max; i++) {
            if (life[i] <= 0) continue;
            vx[i] += dfx;
            vy[i] += dfy;
        }
    }
}

/** Point attractor / repulsor. Negative strength = repel. */
export class GravityWell {
    constructor(px, py, strength, radius = 200) {
        this.px = px;
        this.py = py;
        this.strength = strength;
        this.radius = radius;
        this.radiusSq = radius * radius;
        this.enabled = true;
    }

    apply(dt, x, y, vx, vy, life, max) {
        if (!this.enabled) return;
        for (let i = 0; i < max; i++) {
            if (life[i] <= 0) continue;
            const dx = this.px - x[i];
            const dy = this.py - y[i];
            const distSq = dx * dx + dy * dy;
            if (distSq > this.radiusSq || distSq < 1) continue;
            const dist = Math.sqrt(distSq);
            const force = (this.strength / dist) * dt;
            vx[i] += (dx / dist) * force;
            vy[i] += (dy / dist) * force;
        }
    }
}

/** Spinning vortex — particles orbit a center point. */
export class Vortex {
    constructor(px, py, strength, pull = 0, radius = 300) {
        this.px = px;
        this.py = py;
        this.strength = strength;
        this.pull = pull;
        this.radius = radius;
        this.radiusSq = radius * radius;
        this.enabled = true;
    }

    apply(dt, x, y, vx, vy, life, max) {
        if (!this.enabled) return;
        for (let i = 0; i < max; i++) {
            if (life[i] <= 0) continue;
            const dx = this.px - x[i];
            const dy = this.py - y[i];
            const distSq = dx * dx + dy * dy;
            if (distSq > this.radiusSq || distSq < 1) continue;
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;
            const tForce = (this.strength / dist) * dt;
            vx[i] += -ny * tForce + nx * this.pull * dt;
            vy[i] += nx * tForce + ny * this.pull * dt;
        }
    }
}

/** Cheap sine-based pseudo-turbulence. Zero allocations. */
export class Turbulence {
    constructor(strength, scale = 0.01, speed = 1) {
        this.strength = strength;
        this.scale = scale;
        this.speed = speed;
        this._time = 0;
        this.enabled = true;
    }

    apply(dt, x, y, vx, vy, life, max) {
        if (!this.enabled) return;
        this._time += dt * this.speed;
        const s = this.scale;
        const t = this._time;
        const str = this.strength * dt;
        for (let i = 0; i < max; i++) {
            if (life[i] <= 0) continue;
            const px = x[i] * s;
            const py = y[i] * s;
            vx[i] += Math.sin(py * 2.7 + t * 1.3) * Math.cos(px * 1.9 + t) * str;
            vy[i] += Math.cos(px * 2.3 + t * 0.9) * Math.sin(py * 1.7 + t * 1.1) * str;
        }
    }
}

/** Global drag / air resistance. */
export class DragField {
    constructor(factor = 0.95) {
        this.factor = factor;
        this.enabled = true;
    }

    apply(dt, x, y, vx, vy, life, max) {
        if (!this.enabled) return;
        const f = Math.pow(this.factor, dt * 60);
        for (let i = 0; i < max; i++) {
            if (life[i] <= 0) continue;
            vx[i] *= f;
            vy[i] *= f;
        }
    }
}


// ═══════════════════════════════════════════════════════════
//  EMITTER SHAPES
// ═══════════════════════════════════════════════════════════

const _ZERO = Object.freeze({ x: 0, y: 0 });

export const EmitterShape = {
    point() { return _ZERO; },

    circle(radius, rng) {
        const angle = rng.next() * Math.PI * 2;
        const r = Math.sqrt(rng.next()) * radius;
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    },

    ring(radius, rng) {
        const angle = rng.next() * Math.PI * 2;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    },

    line(width, rng) {
        return { x: (rng.next() - 0.5) * width, y: 0 };
    },

    rect(w, h, rng) {
        return { x: (rng.next() - 0.5) * w, y: (rng.next() - 0.5) * h };
    },

    rectEdge(w, h, rng) {
        const perimeter = 2 * (w + h);
        let d = rng.next() * perimeter;
        if (d < w) return { x: d - w / 2, y: -h / 2 };
        d -= w;
        if (d < h) return { x: w / 2, y: d - h / 2 };
        d -= h;
        if (d < w) return { x: d - w / 2, y: h / 2 };
        d -= w;
        return { x: -w / 2, y: d - h / 2 };
    },
};


// ═══════════════════════════════════════════════════════════
//  PRESETS — Lazy factories (no side-effects at import time)
// ═══════════════════════════════════════════════════════════

export const Presets = {
    fire: () => ({
        count: [5, 10], life: [0.4, 0.8], speed: [50, 150],
        angle: [-Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5],
        gravity: -100, friction: 0.95, size: [6, 0],
        colorFn: createGradient([
            { l: 1.0, c: 0.0, h: 60 }, { l: 0.8, c: 0.25, h: 40 },
            { l: 0.5, c: 0.30, h: 15 }, { l: 0.15, c: 0.05, h: 0 },
        ], easeOut),
        blendMode: 'screen', shape: 'circle',
    }),

    smoke: () => ({
        count: [2, 5], life: [1.0, 2.5], speed: [10, 40],
        angle: [-Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3],
        gravity: -30, friction: 0.92, size: [8, 20],
        colorFn: createGradient([
            { l: 0.7, c: 0.01, h: 0 }, { l: 0.4, c: 0.01, h: 0 },
            { l: 0.25, c: 0.005, h: 0 },
        ]),
        blendMode: 'source-over', shape: 'circle',
    }),

    sparks: () => ({
        count: [15, 30], life: [0.2, 0.6], speed: [200, 500],
        angle: [0, Math.PI * 2],
        gravity: 400, friction: 0.90, size: [3, 1],
        colorFn: createGradient([
            { l: 1.0, c: 0.0, h: 60 }, { l: 0.9, c: 0.15, h: 45 },
        ], easeOut),
        blendMode: 'screen', shape: 'rect',
    }),

    explosion: () => ({
        count: [40, 80], life: [0.3, 1.0], speed: [100, 400],
        angle: [0, Math.PI * 2],
        gravity: 150, friction: 0.93, size: [5, 1],
        colorFn: createGradient([
            { l: 1.0, c: 0.0, h: 60 }, { l: 0.8, c: 0.3, h: 35 },
            { l: 0.4, c: 0.2, h: 10 }, { l: 0.1, c: 0.02, h: 0 },
        ], easeOut),
        blendMode: 'screen', shape: 'circle',
    }),

    magic: () => ({
        count: [8, 15], life: [0.5, 1.2], speed: [20, 80],
        angle: [0, Math.PI * 2],
        gravity: -40, friction: 0.97, size: [4, 0],
        colorFn: createGradient([
            { l: 0.95, c: 0.1, h: 280 }, { l: 0.7, c: 0.25, h: 300 },
            { l: 0.5, c: 0.2, h: 260 },
        ], easeOut),
        blendMode: 'screen', shape: 'circle',
    }),

    rain: () => ({
        count: [1, 3], life: [0.8, 1.5], speed: [300, 500],
        angle: [Math.PI / 2 - 0.1, Math.PI / 2 + 0.1],
        gravity: 200, friction: 1.0, size: [1, 1],
        colorFn: () => ({ l: 0.75, c: 0.03, h: 230 }),
        blendMode: 'source-over', shape: 'rect',
    }),

    snow: () => ({
        count: [1, 2], life: [4, 8], speed: [15, 35],
        angle: [Math.PI / 2 - 0.4, Math.PI / 2 + 0.4],
        gravity: 0, friction: 0.99, size: [2, 4],
        colorFn: () => ({ l: 0.95, c: 0.01, h: 230 }),
        blendMode: 'source-over', shape: 'circle',
    }),

    confetti: () => ({
        count: [40, 70], life: [1.5, 3.5], speed: [100, 350],
        angle: [-Math.PI / 2 - 0.8, -Math.PI / 2 + 0.8],
        gravity: 200, friction: 0.97, size: [5, 3],
        colorFn: (t) => {
            const hues = [0, 40, 60, 130, 200, 280, 330];
            return { l: 0.7, c: 0.25, h: hues[Math.floor(t * 100) % hues.length] };
        },
        blendMode: 'source-over', shape: 'rect',
    }),
};


// ═══════════════════════════════════════════════════════════
//  FX SYSTEM — The Main Orchestrator
// ═══════════════════════════════════════════════════════════

export class FXSystem {
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object}  [options]
     * @param {number}  [options.maxParticles=5000]
     * @param {number}  [options.seed]  RNG seed for deterministic effects
     * @param {boolean} [options.debug=false]  Draw force field radii and particle count
     */
    constructor(ctx, { maxParticles = 5000, seed, debug = false } = {}) {
        this.ctx = ctx;
        this.engine = new SoaParticleEngine(maxParticles);
        this.rng = new Random(seed ?? Date.now());
        this.debug = debug;
        this._destroyed = false;

        /** @type {Array<{apply: Function}>} */
        this.forces = [];

        /** @type {Object[]} Recipe registry (array-indexed by integer ID) */
        this._recipes = [];
        this._nextRecipeId = 0;

        // Particle count for debug display
        this._aliveCount = 0;

        this.engine.onTick(this._tick.bind(this));
    }

    // ── Recipe Management ──

    /**
     * Register a recipe (preset function or plain object). Auto-assigns ID.
     * @param {Object|Function} recipeOrPreset
     * @returns {Object} Frozen recipe with .id
     */
    register(recipeOrPreset) {
        const recipe = typeof recipeOrPreset === 'function'
            ? recipeOrPreset()
            : { ...recipeOrPreset };

        if (typeof recipe.colorFn !== 'function') {
            throw new Error('FXSystem: recipe.colorFn must be a function');
        }

        recipe.id = this._nextRecipeId++;
        this._recipes[recipe.id] = Object.freeze(recipe);
        return this._recipes[recipe.id];
    }

    // ── Force Field Management ──

    /**
     * Add a force field. Returns a disposer.
     * @param {{apply: Function, enabled: boolean}} force
     * @returns {Function}
     */
    addForce(force) {
        this.forces.push(force);
        return () => {
            const idx = this.forces.indexOf(force);
            if (idx !== -1) this.forces.splice(idx, 1);
        };
    }

    // ── Spawning ──

    /**
     * Spawn particles at (x, y) using a registered recipe.
     * @param {number} x
     * @param {number} y
     * @param {Object} recipe
     * @param {Object} [options]
     * @param {Function} [options.shape]  (rng) => {x, y}
     * @param {Random}   [options.rng]    Override RNG
     */
    spawn(x, y, recipe, { shape, rng } = {}) {
        if (this._destroyed) return;
        const r = rng || this.rng;
        const count = r.int(recipe.count[0], recipe.count[1]);

        for (let i = 0; i < count; i++) {
            let ox = 0, oy = 0;
            if (shape) {
                const offset = shape(r);
                if (offset) { ox = offset.x || 0; oy = offset.y || 0; }
            }

            const angle = r.range(recipe.angle[0], recipe.angle[1]);
            const speed = r.range(recipe.speed[0], recipe.speed[1]);
            const life = r.range(recipe.life[0], recipe.life[1]);

            this.engine.emit(
                x + ox, y + oy,
                Math.cos(angle) * speed, Math.sin(angle) * speed,
                life, recipe.id
            );
        }
    }

    /**
     * Register and spawn in one call. Returns the recipe for reuse.
     * @param {number} x
     * @param {number} y
     * @param {Function} presetFn  e.g. Presets.fire
     * @param {Object} [options]
     * @returns {Object}
     */
    burst(x, y, presetFn, options) {
        const recipe = this.register(presetFn);
        this.spawn(x, y, recipe, options);
        return recipe;
    }

    // ── Lifecycle ──

    /** Start the render loop. */
    start() { this.engine.start(); }

    /** Stop the render loop. */
    stop() { this.engine.stop(); }

    /** Alias for stop(). */
    pause() { this.engine.stop(); }

    /** Whether the engine is currently running. */
    get isRunning() { return this.engine._isRunning; }

    /** Number of alive particles (updated each frame). */
    get aliveCount() { return this._aliveCount; }

    /** Kill all particles. */
    clear() { this.engine.clear(); }

    /** Reset RNG for deterministic replay. */
    resetSeed(seed) { this.rng.reset(seed); }

    /** Destroy everything. Idempotent. */
    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.engine.destroy();
        this.forces = null;
        this._recipes = null;
        this.ctx = null;
    }

    // ── Render Pipeline ──

    /** @private */
    _tick(dt, x, y, vx, vy, life, invLife, data, max) {
        const { ctx } = this;
        if (!ctx) return;

        // 1. Apply force fields
        const forces = this.forces;
        if (forces) {
            for (let f = 0; f < forces.length; f++) {
                forces[f].apply(dt, x, y, vx, vy, life, max);
            }
        }

        // 2. Per-particle physics + rendering
        let currentBlend = 'source-over';
        ctx.globalCompositeOperation = currentBlend;
        let alive = 0;

        for (let i = 0; i < max; i++) {
            if (life[i] <= 0) { life[i] = 0; continue; }

            const recipe = this._recipes?.[data[i]];
            if (!recipe) { life[i] = 0; continue; }

            // Life decay (clamp to 0 immediately)
            life[i] = Math.max(0, life[i] - dt);
            if (life[i] <= 0) continue;

            alive++;

            // Per-recipe friction
            if (recipe.friction !== 1) {
                vx[i] *= recipe.friction;
                vy[i] *= recipe.friction;
            }

            // Per-recipe gravity
            if (recipe.gravity) vy[i] += recipe.gravity * dt;

            // Integrate
            x[i] += vx[i] * dt;
            y[i] += vy[i] * dt;

            // Progress: 0 at birth → 1 at death
            const progress = 1 - life[i] * invLife[i];

            // Blend mode caching
            const blend = recipe.blendMode || 'source-over';
            if (currentBlend !== blend) {
                currentBlend = blend;
                ctx.globalCompositeOperation = blend;
            }

            const size = lerp(recipe.size[0], recipe.size[1], progress);
            ctx.globalAlpha = 1 - progress;
            ctx.fillStyle = toCssOklch(recipe.colorFn(progress));

            if (recipe.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(x[i], y[i], size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                const half = size / 2;
                ctx.fillRect(x[i] - half, y[i] - half, size, size);
            }
        }

        this._aliveCount = alive;

        // Reset context
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        // Debug overlay
        if (this.debug) this._drawDebug(x, y, life, max);
    }

    /** @private */
    _drawDebug(x, y, life, max) {
        const ctx = this.ctx;
        if (!ctx) return;

        // Particle count
        ctx.fillStyle = '#0f0';
        ctx.font = '12px monospace';
        ctx.fillText(`Particles: ${this._aliveCount}`, 4, 14);

        // Force field radii
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        const forces = this.forces;
        if (forces) {
            for (const f of forces) {
                if (f.radius && f.px !== undefined) {
                    ctx.beginPath();
                    ctx.arc(f.px, f.py, f.radius, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }
    }
}

export default FXSystem;
