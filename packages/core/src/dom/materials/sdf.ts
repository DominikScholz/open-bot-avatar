/**
 * Shared 3D signed-distance baking over Volume parts for ray-marched materials (glass, metal).
 * Inflate parts receive a screened-Poisson smoothed interior bevel; revolved parts retain their
 * exact axes and depth. The field is stored as a mirror-symmetric R16F 3D texture (positive inside).
 */
import { EdgeIndex } from '../../distance.ts';
import { edgeBands } from '../../path.ts';
import type { Volume, VolumePart } from '../../volume.ts';

const VOL_PAD = 4.5;

export interface SdfOptions {
  /** Smooth union fillet radius where separate parts meet, viewBox units. */
  joinK?: number;
  /** Smoothness of the bevel-to-face transition on inflated parts. */
  bevelSmooth?: number;
  /** Subtle convex polish along the smoothed bevel depth on inflated parts. */
  crownSlope?: number;
  /** Extra smooth macro-dome height across inflated faces (fraction of half-depth, capped). */
  domeHeight?: number;
  /** Separable 3D Gaussian smoothing passes to suppress trilinear voxel ripples. */
  smoothPasses?: number;
  /** Side tap weight of each 3D Gaussian pass. */
  smoothWeight?: number;
}

export interface BakedSdf {
  data: Uint16Array;
  boxMin: [number, number, number];
  boxSpan: [number, number, number];
  voxelStep: [number, number];
  halfDepth: number;
  bottomY: number;
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** Convert a JS number to IEEE 754 binary16 (half-float) bits. */
export function toHalf(val: number): number {
  f32[0] = val;
  const x = u32[0];
  const sign = (x >> 16) & 0x8000;
  const exp = ((x >> 23) & 0xff) - 127 + 15;
  const mant = (x >> 13) & 0x03ff;
  if (exp <= 0) return sign;
  if (exp >= 31) return sign | 0x7c00;
  return sign | (exp << 10) | mant;
}

/** Smooth max for C2-smooth fillets and fused multi-part joints. */
export function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

function addPart(
  field: Float32Array,
  part: VolumePart,
  x0: number,
  y0: number,
  z0: number,
  stepXY: number,
  stepZ: number,
  nxy: number,
  nz: number,
  firstPart: boolean,
  joinK: number,
  bevelSmooth: number,
  crownSlope: number,
  domeHeight: number,
) {
  const plane = nxy * nxy;
  const index = new EdgeIndex(part.polys, part.bounds);
  const bands = edgeBands(part.polys);
  const dist2d = index.distances({ x0, y0, step: stepXY, nx: nxy, ny: nxy });
  const xs = Array.from({ length: nxy }, (_, i) => x0 + i * stepXY);
  const row = new Uint8Array(nxy);

  // Build signed 2D distance (positive inside) once for this part
  const sd2d = new Float32Array(plane);
  for (let j = 0; j < nxy; j++) {
    bands.insideRow(y0 + j * stepXY, xs, row);
    const off = j * nxy;
    for (let i = 0; i < nxy; i++) {
      sd2d[off + i] = row[i] ? dist2d[off + i] : -dist2d[off + i];
    }
  }

  // Bilinear lookup into sd2d for exact 3D solid-of-revolution SDF:
  // revolve-y: d3d(x, y, z) = sd2d(axis + hypot(x - axis, z / zScale), y)
  // revolve-x: d3d(x, y, z) = sd2d(x, axis + hypot(y - axis, z / zScale))
  const sampleSD2D = (px: number, py: number): number => {
    const fx = (px - x0) / stepXY;
    const fy = (py - y0) / stepXY;
    const ix = Math.max(0, Math.min(nxy - 2, Math.floor(fx)));
    const iy = Math.max(0, Math.min(nxy - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - ix));
    const ty = Math.max(0, Math.min(1, fy - iy));
    const o = iy * nxy + ix;
    const a = sd2d[o] * (1 - tx) + sd2d[o + 1] * tx;
    const b = sd2d[o + nxy] * (1 - tx) + sd2d[o + nxy + 1] * tx;
    return a * (1 - ty) + b * ty;
  };

  if (part.kind === 'revolve-y' && part.axis !== undefined) {
    const axis = part.axis;
    const zScale = part.thickness > 0.01 ? part.depth / part.thickness : 1;
    const invZ = zScale > 0.01 ? 1 / zScale : 1;
    for (let j = 0; j < nxy; j++) {
      const y = y0 + j * stepXY;
      const off = j * nxy;
      for (let i = 0; i < nxy; i++) {
        const dx = x0 + i * stepXY - axis;
        for (let k = 0; k < nz; k++) {
          const z = Math.abs(z0 + k * stepZ) * invZ;
          const rho = Math.hypot(dx, z);
          const d = sampleSD2D(axis + rho, y) * Math.min(1, zScale);
          const at = off + i + k * plane;
          field[at] = firstPart ? d : smax(field[at], d, joinK);
        }
      }
    }
    return;
  }

  if (part.kind === 'revolve-x' && part.axis !== undefined) {
    const axis = part.axis;
    const zScale = part.thickness > 0.01 ? part.depth / part.thickness : 1;
    const invZ = zScale > 0.01 ? 1 / zScale : 1;
    for (let j = 0; j < nxy; j++) {
      const dy = y0 + j * stepXY - axis;
      const off = j * nxy;
      for (let i = 0; i < nxy; i++) {
        const x = x0 + i * stepXY;
        for (let k = 0; k < nz; k++) {
          const z = Math.abs(z0 + k * stepZ) * invZ;
          const rho = Math.hypot(dy, z);
          const d = sampleSD2D(x, axis + rho) * Math.min(1, zScale);
          const at = off + i + k * plane;
          field[at] = firstPart ? d : smax(field[at], d, joinK);
        }
      }
    }
    return;
  }

  // Inflate part: exact VolumePart depth & elliptical edge fillet (rxy, rz).
  // Solve screened Poisson (s - L^2 * Delta(s) = min(sd2d, rCap), s = 0 on exact outline via
  // Shortley-Weller cut-cell fractions) inside the 2D part. This keeps the exact 2D silhouette and
  // true thickness while melting away interior medial-axis corner ridges.
  const half = part.depth / 2;
  const rxy = Math.max(1.2, part.rxy);
  const rz = Math.max(1.2, part.rz);
  const scale = Math.min(rxy, rz);
  const flatZ = Math.max(0, half - rz);

  const rCap = rxy * 1.08;
  const smoothL = Math.max(stepXY * 1.4, Math.min(rxy * 0.28, 3.4));
  const cLap = 2 * (smoothL / stepXY) * (smoothL / stepXY);

  const pb = part.bounds;
  const iMin = Math.max(1, Math.floor((pb.minX - x0) / stepXY) - 1);
  const iMax = Math.min(nxy - 2, Math.ceil((pb.maxX - x0) / stepXY) + 1);
  const jMin = Math.max(1, Math.floor((pb.minY - y0) / stepXY) - 1);
  const jMax = Math.min(nxy - 2, Math.ceil((pb.maxY - y0) / stepXY) + 1);

  const sSmooth = new Float32Array(plane);
  for (let j = jMin; j <= jMax; j++) {
    const off = j * nxy;
    for (let i = iMin; i <= iMax; i++) {
      const sd = sd2d[off + i];
      if (sd > 0) sSmooth[off + i] = Math.min(sd, rCap);
    }
  }

  // Smooth the interior bevel with 16 Gauss-Seidel SOR passes.
  const omega = 1.25;
  for (let iter = 0; iter < 16; iter++) {
    for (let j = jMin; j <= jMax; j++) {
      const off = j * nxy;
      for (let i = iMin; i <= iMax; i++) {
        const idx = off + i;
        const sd = sd2d[idx];
        if (sd <= 0) continue;

        const sdL = sd2d[idx - 1];
        const sdR = sd2d[idx + 1];
        const sdU = sd2d[idx - nxy];
        const sdD = sd2d[idx + nxy];

        const tL = sdL > 0 ? 1 : Math.max(0.15, sd / (sd - sdL));
        const tR = sdR > 0 ? 1 : Math.max(0.15, sd / (sd - sdR));
        const tU = sdU > 0 ? 1 : Math.max(0.15, sd / (sd - sdU));
        const tD = sdD > 0 ? 1 : Math.max(0.15, sd / (sd - sdD));

        const vL = sdL > 0 ? sSmooth[idx - 1] : 0;
        const vR = sdR > 0 ? sSmooth[idx + 1] : 0;
        const vU = sdU > 0 ? sSmooth[idx - nxy] : 0;
        const vD = sdD > 0 ? sSmooth[idx + nxy] : 0;

        const denom = 1 + cLap * (1 / (tL * tR) + 1 / (tU * tD));
        const numer =
          Math.min(sd, rCap) +
          cLap *
            (vL / (tL * (tL + tR)) +
              vR / (tR * (tL + tR)) +
              vU / (tU * (tU + tD)) +
              vD / (tD * (tU + tD)));
        const next = numer / denom;
        sSmooth[idx] += omega * (next - sSmooth[idx]);
      }
    }
  }

  const pcx = (pb.minX + pb.maxX) / 2;
  const pcy = (pb.minY + pb.maxY) / 2;
  const phx = Math.max(4, (pb.maxX - pb.minX) / 2);
  const phy = Math.max(4, (pb.maxY - pb.minY) / 2);
  const maxDome = domeHeight > 0 ? Math.min(2.6, half * domeHeight) : 0;

  for (let j = 0; j < nxy; j++) {
    const off = j * nxy;
    const dy = (y0 + j * stepXY - pcy) / phy;
    for (let i = 0; i < nxy; i++) {
      const sd = sd2d[off + i];
      const sdEff = sd > 0 ? sSmooth[off + i] : sd;
      let crown = sd > 0 ? crownSlope * sdEff : 0;
      if (maxDome > 0 && sd > 0) {
        const dx = (x0 + i * stepXY - pcx) / phx;
        const r2 = Math.min(1, 0.82 * (dx * dx + dy * dy));
        const tIn = Math.min(1, sdEff / rxy);
        const inMask = tIn * tIn * (3 - 2 * tIn);
        crown += maxDome * (1 - r2) * inMask;
      }
      const side = smax((rxy - sdEff) / rxy, 0, bevelSmooth);
      for (let k = 0; k < nz; k++) {
        const z = Math.abs(z0 + k * stepZ);
        const top = Math.max(0, (z - (flatZ + crown)) / rz);
        const d = (1 - Math.hypot(side, top)) * scale;
        const at = off + i + k * plane;
        field[at] = firstPart ? d : smax(field[at], d, joinK);
      }
    }
  }
}

/** Bake a Volume into a mirror-symmetric 3D R16F signed-distance texture (positive inside). */
export function bakeVolume3D(vol: Volume, nxy: number, nz: number, options: SdfOptions = {}): BakedSdf {
  const joinK = options.joinK ?? 1.1;
  const bevelSmooth = options.bevelSmooth ?? 0.28;
  const crownSlope = options.crownSlope ?? 0.055;
  const domeHeight = options.domeHeight ?? 0;
  const smoothPasses = options.smoothPasses ?? 3;
  const sideW = options.smoothWeight ?? 0.13;
  const centerW = 1 - 2 * sideW;

  const b = vol.bounds;
  const maxPartHalf = Math.max(0, ...vol.parts.map((p) => p.depth / 2));
  const domePad = domeHeight > 0 ? Math.min(2.6, maxPartHalf * domeHeight) : 0;
  const maxHalfZ = Math.max(2, maxPartHalf) + 1.0 + domePad;
  const spanX = b.maxX - b.minX + 2 * VOL_PAD;
  const spanY = b.maxY - b.minY + 2 * VOL_PAD;
  const spanXY = Math.max(spanX, spanY);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const x0 = cx - spanXY / 2;
  const y0 = cy - spanXY / 2;
  const stepXY = spanXY / (nxy - 1);

  // Place z = 0 at k = 1, z = -stepZ at k = 0 (mirror of k = 2), so trilinear interpolation across z = 0 is exact.
  const zMax = maxHalfZ + VOL_PAD;
  const stepZ = zMax / (nz - 2);
  const z0 = -stepZ;
  const spanZ = stepZ * (nz - 1);

  const plane = nxy * nxy;
  const field = new Float32Array(plane * nz).fill(-1000);

  vol.parts.forEach((part, idx) => {
    addPart(field, part, x0, y0, z0, stepXY, stepZ, nxy, nz, idx === 0, joinK, bevelSmooth, crownSlope, domeHeight);
  });

  // Gentle separable 3D Gaussian passes suppress trilinear grid ripples while keeping silhouettes crisp.
  const tmp = new Float32Array(field.length);
  for (let pass = 0; pass < smoothPasses; pass++) {
    for (let k = 0; k < nz; k++) {
      const ko = k * plane;
      for (let j = 0; j < nxy; j++) {
        const ro = ko + j * nxy;
        for (let i = 0; i < nxy; i++) {
          const im = i > 0 ? i - 1 : 0;
          const ip = i < nxy - 1 ? i + 1 : nxy - 1;
          tmp[ro + i] = sideW * field[ro + im] + centerW * field[ro + i] + sideW * field[ro + ip];
        }
      }
    }
    for (let k = 0; k < nz; k++) {
      const ko = k * plane;
      for (let j = 0; j < nxy; j++) {
        const jm = ko + (j > 0 ? j - 1 : 0) * nxy;
        const j0 = ko + j * nxy;
        const jp = ko + (j < nxy - 1 ? j + 1 : nxy - 1) * nxy;
        for (let i = 0; i < nxy; i++) {
          field[j0 + i] = sideW * tmp[jm + i] + centerW * tmp[j0 + i] + sideW * tmp[jp + i];
        }
      }
    }
    for (let k = 1; k < nz; k++) {
      const km = (k === 1 ? 2 : k - 1) * plane;
      const k0 = k * plane;
      const kp = (k < nz - 1 ? k + 1 : nz - 1) * plane;
      for (let p = 0; p < plane; p++) {
        tmp[k0 + p] = sideW * field[km + p] + centerW * field[k0 + p] + sideW * field[kp + p];
      }
    }
    for (let p = 0; p < plane; p++) tmp[p] = tmp[2 * plane + p];
    field.set(tmp);
  }

  const data = new Uint16Array(field.length);
  for (let i = 0; i < field.length; i++) data[i] = toHalf(field[i]);

  return {
    data,
    boxMin: [x0, y0, z0],
    boxSpan: [spanXY, spanXY, spanZ],
    voxelStep: [stepXY, stepZ],
    halfDepth: maxHalfZ,
    bottomY: b.maxY,
  };
}
