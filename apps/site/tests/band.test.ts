import { describe, expect, it } from "vitest";
import { SpinClock, paintSizeScale } from "../src/studio/Band.tsx";

const DT = 1 / 120;
const TAU = Math.PI * 2;

/** Run the clock and report when each impulse starts, and what the turn did. */
function run(seconds: number, mode: "working" | "done" | null = "working") {
  const clock = new SpinClock();
  const steps = Math.round(seconds / DT);
  const starts: number[] = [];
  const samples: { t: number; face: number; angle: number; bodyTurn: number; rate: number }[] = [];
  let spinning = false;
  for (let i = 0; i < steps; i++) {
    const spin = clock.step(DT, mode);
    if (spin.spinning && !spinning) starts.push(i * DT);
    spinning = spin.spinning;
    samples.push({ t: i * DT, face: spin.face, angle: spin.angle, bodyTurn: spin.bodyTurn, rate: spin.rate });
  }
  return { starts, samples };
}

describe("the working turn", () => {
  it("arms the first turn for one to two and a half seconds", () => {
    const { starts } = run(6);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts[0]).toBeGreaterThanOrEqual(1.2);
    expect(starts[0]).toBeLessThanOrEqual(2.4);
  });

  it("fires the next turn every six to nine seconds, counted from the last start", () => {
    const { starts } = run(26);
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1];
      expect(gap).toBeGreaterThanOrEqual(6);
      expect(gap).toBeLessThanOrEqual(9);
    }
  });

  it("turns the face and the paint with the same angle, and leaves the body in place", () => {
    const { samples } = run(6);
    const turning = samples.filter((s) => Math.abs(s.rate) > 0.5);
    expect(turning.length).toBeGreaterThan(0);
    for (const s of turning) {
      expect(s.face).toBeCloseTo(s.angle, 10);
      expect(s.bodyTurn).toBe(0);
    }
  });

  it("turns the face one full circle and lets it come back", () => {
    const { samples } = run(6);
    const peak = Math.max(...samples.map((s) => s.face));
    expect(peak).toBeGreaterThan(TAU * 0.99);
    expect(peak).toBeLessThan(TAU * 1.01);
    expect(samples[samples.length - 1].face).toBe(0);
  });

  it("rests between the turns", () => {
    const { samples } = run(4);
    const resting = samples.filter((s) => s.t < 1);
    expect(resting.every((s) => s.face === 0 && s.angle === 0 && s.rate === 0)).toBe(true);
  });
});

describe("the brush's size rule", () => {
  it("gives the official's own bot 1.98", () => {
    expect(paintSizeScale(128)).toBeCloseTo(1.98, 2);
  });

  it("holds the official's figure weight for a bot drawn larger", () => {
    expect(paintSizeScale(340)).toBeCloseTo(1.98, 5);
    expect(paintSizeScale(640)).toBeCloseTo(1.98, 5);
  });

  it("fattens the brush for a small bot, and stops at the official's bound", () => {
    expect(paintSizeScale(64)).toBeCloseTo(2.6, 5);
    expect(paintSizeScale(96)).toBeGreaterThan(2);
    expect(paintSizeScale(96)).toBeLessThan(2.6);
  });

  it("keeps the figure weight when the size is unknown", () => {
    expect(paintSizeScale(0)).toBeCloseTo(1.98, 5);
    expect(paintSizeScale(NaN)).toBeCloseTo(1.98, 5);
  });
});
