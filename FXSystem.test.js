import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@zakkster/lite-soa-particle-engine', () => {
    class MockEngine {
        constructor(max) { this.max = max; this._onTick = null; this._emitted = []; this._isRunning = false; this._destroyed = false; }
        onTick(cb) { this._onTick = cb; }
        emit(x, y, vx, vy, life, data) { this._emitted.push({ x, y, vx, vy, life, data }); }
        start() { this._isRunning = true; }
        stop() { this._isRunning = false; }
        clear() { this._emitted = []; }
        destroy() { this._destroyed = true; this._isRunning = false; }
    }
    return { SoaParticleEngine: MockEngine, default: MockEngine };
});

vi.mock('@zakkster/lite-color', () => ({
    createGradient: (colors, ease) => (t) => colors[0] || { l: 0.5, c: 0.1, h: 0 },
    toCssOklch: () => 'oklch(0.5 0.1 0)',
}));

vi.mock('@zakkster/lite-lerp', () => ({
    lerp: (a, b, t) => a + (b - a) * t,
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    easeOut: (t) => t, easeIn: (t) => t, easeInOut: (t) => t,
}));

vi.mock('@zakkster/lite-random', () => {
    class R { constructor(s) { this._s = s || 1; this._i = 0; } next() { return (++this._i * 0.1) % 1; } range(a, b) { return a + this.next() * (b - a); } int(a, b) { return Math.floor(this.range(a, b + 1)); } reset(s) { this._s = s || this._s; this._i = 0; } }
    return { default: R, Random: R };
});

import { FXSystem, Presets, Wind, GravityWell, Vortex, Turbulence, DragField, EmitterShape } from './FXSystem.js';

describe('💥 LiteFX', () => {
    let fx, ctx;
    beforeEach(() => {
        ctx = { globalCompositeOperation: '', globalAlpha: 1, fillStyle: '', fillRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillText: vi.fn(), font: '', strokeStyle: '', lineWidth: 1, stroke: vi.fn() };
        fx = new FXSystem(ctx, { maxParticles: 100, seed: 42 });
    });
    afterEach(() => { fx?.destroy(); });

    describe('FXSystem', () => {
        it('creates engine with max particles', () => { expect(fx.engine.max).toBe(100); });
        it('register assigns auto-incrementing IDs', () => {
            const a = fx.register(Presets.fire);
            const b = fx.register(Presets.sparks);
            expect(a.id).toBe(0); expect(b.id).toBe(1);
        });
        it('register throws if colorFn is missing', () => {
            expect(() => fx.register({ count: [1,2], colorFn: null })).toThrow(/colorFn/);
        });
        it('spawn emits particles', () => {
            const r = fx.register(Presets.fire);
            fx.spawn(100, 200, r);
            expect(fx.engine._emitted.length).toBeGreaterThan(0);
        });
        it('spawn validates shape return', () => {
            const r = fx.register(Presets.fire);
            fx.spawn(0, 0, r, { shape: () => undefined });
            expect(fx.engine._emitted.length).toBeGreaterThan(0);
        });
        it('burst registers and spawns', () => {
            const r = fx.burst(100, 200, Presets.sparks);
            expect(r.id).toBeDefined();
            expect(fx.engine._emitted.length).toBeGreaterThan(0);
        });
        it('addForce returns disposer', () => {
            const w = new Wind(10, 0);
            const rm = fx.addForce(w);
            expect(fx.forces.length).toBe(1);
            rm();
            expect(fx.forces.length).toBe(0);
        });
        it('start/stop/pause delegate to engine', () => {
            fx.start(); expect(fx.isRunning).toBe(true);
            fx.pause(); expect(fx.isRunning).toBe(false);
        });
        it('resetSeed resets the RNG', () => {
            fx.rng.next(); fx.resetSeed(99);
            expect(fx.rng._i).toBe(0);
        });
        it('destroy nulls references', () => {
            fx.destroy();
            expect(fx.ctx).toBeNull();
            expect(fx.forces).toBeNull();
            expect(fx._recipes).toBeNull();
        });
        it('destroy is idempotent', () => { fx.destroy(); expect(() => fx.destroy()).not.toThrow(); });
        it('spawn is no-op after destroy', () => {
            const r = fx.register(Presets.fire);
            fx.destroy(); fx.spawn(0, 0, r);
        });
    });

    describe('Force Fields', () => {
        it('Wind applies constant force', () => {
            const w = new Wind(100, 200);
            const vx = new Float32Array([0]), vy = new Float32Array([0]), life = new Float32Array([1]);
            w.apply(0.016, new Float32Array(1), new Float32Array(1), vx, vy, life, 1);
            expect(vx[0]).toBeCloseTo(1.6); expect(vy[0]).toBeCloseTo(3.2);
        });
        it('Wind can be disabled', () => {
            const w = new Wind(100, 0); w.enabled = false;
            const vx = new Float32Array([0]), life = new Float32Array([1]);
            w.apply(0.016, new Float32Array(1), new Float32Array(1), vx, new Float32Array(1), life, 1);
            expect(vx[0]).toBe(0);
        });
        it('GravityWell attracts particles', () => {
            const g = new GravityWell(100, 0, 500, 200);
            const x = new Float32Array([0]), vx = new Float32Array([0]), life = new Float32Array([1]);
            g.apply(0.016, x, new Float32Array(1), vx, new Float32Array(1), life, 1);
            expect(vx[0]).toBeGreaterThan(0);
        });
        it('DragField reduces velocity', () => {
            const d = new DragField(0.9);
            const vx = new Float32Array([100]), life = new Float32Array([1]);
            d.apply(0.016, new Float32Array(1), new Float32Array(1), vx, new Float32Array(1), life, 1);
            expect(vx[0]).toBeLessThan(100);
        });
        it('Turbulence modifies velocity', () => {
            const t = new Turbulence(100, 0.01, 1);
            const vx = new Float32Array([0]), vy = new Float32Array([0]), life = new Float32Array([1]);
            t.apply(0.1, new Float32Array([50]), new Float32Array([50]), vx, vy, life, 1);
            expect(vx[0] !== 0 || vy[0] !== 0).toBe(true);
        });
    });

    describe('EmitterShape', () => {
        const rng = { next: () => 0.5 };
        it('point returns {0,0}', () => { expect(EmitterShape.point()).toEqual({ x: 0, y: 0 }); });
        it('circle returns offset within radius', () => {
            const p = EmitterShape.circle(100, rng);
            const dist = Math.sqrt(p.x * p.x + p.y * p.y);
            expect(dist).toBeLessThanOrEqual(100);
        });
        it('ring returns offset at exactly radius', () => {
            const p = EmitterShape.ring(50, rng);
            const dist = Math.sqrt(p.x * p.x + p.y * p.y);
            expect(dist).toBeCloseTo(50);
        });
        it('line returns horizontal offset', () => {
            const p = EmitterShape.line(200, rng);
            expect(p.y).toBe(0);
        });
    });

    describe('Presets', () => {
        for (const [name, fn] of Object.entries(Presets)) {
            it(`${name} returns valid recipe`, () => {
                const r = fn();
                expect(r.count).toBeInstanceOf(Array);
                expect(r.colorFn).toBeTypeOf('function');
                expect(r.size).toBeInstanceOf(Array);
            });
        }
    });
});
