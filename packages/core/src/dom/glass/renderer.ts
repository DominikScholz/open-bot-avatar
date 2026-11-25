/**
 * Glass rendering over a sampled 3D distance field built from the existing Volume parts.
 * Inflate parts receive a smoothed interior bevel; revolved parts retain their axes and depth.
 * The field is stored as a mirror-symmetric R16F texture and shaded by ray marching.
 */
import type { EyeMark, SurfaceEye, ViewBasis } from '../../render.ts';
import { bakeVolume3D } from '../materials/sdf.ts';
import { halfDepth, type Capsule, type MaterialShape } from '../materials/shape.ts';
import { SOCKET_TILE, exposedHeight, socketKey, socketRegion, socketTile } from '../materials/socket.ts';
import { fragmentShader, vertexShader } from './shaders.ts';

export type GlassShape = MaterialShape;

export interface GlassLook {
  color: string;
  ink: string;
  eyes: SurfaceEye[];
}

export interface GlassImage {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  size: number;
  cx: number;
  cy: number;
  radius: number;
}

const isCapsule = (shape: GlassShape): shape is Capsule => 'radius' in shape;

const MAX_PIXELS = 1024;
const MIN_PIXELS = 32;
/** 3D SDF grid dimensions (Z stores z >= 0 with 1 ghost slice at -stepZ for exact C1 equator symmetry). */
const GRID_HI = { xy: 104, z: 36 };
const GRID_LO = { xy: 48, z: 18 };
const GLASS_REACH = 4;
const SOCKET_RISE = 0.8;
const SAME_VIEW = 0.06;
const KEPT_SHAPES = 32;
const IDLE_MS = 6000;

type Rgb = [number, number, number];

interface BakedShape {
  texture: WebGLTexture | null;
  gridXY: number;
  /** Origin (x0, y0, z0) of the 3D SDF box in viewBox units. */
  boxMin: [number, number, number];
  /** Extent (spanX, spanY, spanZ) of the 3D SDF box in viewBox units. */
  boxSpan: [number, number, number];
  /** Voxel spacing (stepXY, stepZ) for normal finite differences. */
  voxelStep: [number, number];
  cx: number;
  cy: number;
  bottomY: number;
  radius: number;
  halfDepth: number;
  capsule: boolean;
  capsuleDims: [number, number];
  usedAt: number;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram()!;
  for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(kind)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'glass shader compilation failed');
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'glass shader linking failed');
  return program;
}

function colorReader(): (color: string) => Rgb {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const known = new Map<string, Rgb>();
  return (color) => {
    let rgb = known.get(color);
    if (!rgb) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      rgb = [r, g, b];
      if (known.size >= 64) known.clear();
      known.set(color, rgb);
    }
    return rgb;
  };
}

type Renderer = (shape: GlassShape, view: ViewBasis, look: GlassLook, scale: number) => GlassImage | null;

function createRenderer(onContextRestored: () => void): Renderer | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MIN_PIXELS;
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  const program = link(gl, vertexShader, fragmentShader);
  gl.useProgram(program);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    volumeField: uniform('volumeField'),
    eyeField: uniform('eyeField'),
    boxMin: uniform('boxMin'),
    boxSpan: uniform('boxSpan'),
    voxelStep: uniform('voxelStep'),
    pivot: uniform('pivot'),
    radius: uniform('radius'),
    halfDepth: uniform('halfDepth'),
    bottomY: uniform('bottomY'),
    pixelSize: uniform('pixelSize'),
    isCapsule: uniform('isCapsule'),
    capsuleDims: uniform('capsuleDims'),
    view: uniform('view'),
    color: uniform('color'),
    ink: uniform('ink'),
    eyeRegion: uniform('eyeRegion[0]'),
    eyeSize: uniform('eyeSize[0]'),
  };

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enable(gl.SCISSOR_TEST);

  gl.uniform1i(u.volumeField, 0);
  gl.activeTexture(gl.TEXTURE1);
  const eyeTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, eyeTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, 2 * SOCKET_TILE, SOCKET_TILE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(u.eyeField, 1);

  // Fallback 1x1x1 3D texture for capsule state marks
  const dummyTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, dummyTex);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, 1, 1, 1, 0, gl.RED, gl.HALF_FLOAT, new Uint16Array([0]));

  const shapes = new Map<GlassShape, BakedShape>();
  let sweepPending = false;

  const upload = (shape: GlassShape, grid: { xy: number; z: number }): BakedShape => {
    const b = shape.bounds;
    const rx = (b.maxX - b.minX) / 2;
    const ry = (b.maxY - b.minY) / 2;
    const cx = b.minX + rx;
    const cy = b.minY + ry;

    if (isCapsule(shape)) {
      const rz = halfDepth(shape);
      const radius = Math.ceil(Math.hypot(rx, ry, rz) + GLASS_REACH);
      return {
        texture: null,
        gridXY: 1,
        boxMin: [0, 0, 0],
        boxSpan: [1, 1, 1],
        voxelStep: [1, 1],
        cx, cy, bottomY: b.maxY, radius,
        halfDepth: rz,
        capsule: true,
        capsuleDims: [shape.radius, Math.max(0, b.maxY - shape.radius)],
        usedAt: 0,
      };
    }

    const baked = bakeVolume3D(shape, grid.xy, grid.z);
    const radius = Math.ceil(Math.hypot(rx, ry, baked.halfDepth) + GLASS_REACH);
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, grid.xy, grid.xy, grid.z, 0, gl.RED, gl.HALF_FLOAT, baked.data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    return {
      texture: tex,
      gridXY: grid.xy,
      boxMin: baked.boxMin,
      boxSpan: baked.boxSpan,
      voxelStep: baked.voxelStep,
      cx, cy, bottomY: baked.bottomY, radius,
      halfDepth: baked.halfDepth,
      capsule: false,
      capsuleDims: [0, 0],
      usedAt: 0,
    };
  };

  const sweep = () => {
    const now = performance.now();
    for (const [shape, baked] of shapes) {
      if (shapes.size <= KEPT_SHAPES) return;
      if (now - baked.usedAt < IDLE_MS) continue;
      if (baked.texture) gl.deleteTexture(baked.texture);
      shapes.delete(shape);
    }
    if (!sweepPending) {
      sweepPending = true;
      setTimeout(() => { sweepPending = false; sweep(); }, IDLE_MS);
    }
  };

  const shapeOf = (shape: GlassShape, wantHi: boolean): BakedShape => {
    const desired = wantHi ? GRID_HI : GRID_LO;
    let baked = shapes.get(shape);
    if (baked && (!wantHi || baked.gridXY >= GRID_HI.xy || baked.capsule)) {
      shapes.delete(shape);
    } else {
      if (baked?.texture) gl.deleteTexture(baked.texture);
      baked = upload(shape, desired);
    }
    shapes.set(shape, baked);
    baked.usedAt = performance.now();
    if (shapes.size > KEPT_SHAPES) sweep();
    return baked;
  };

  const regions = new Float32Array(8);
  const sizes = new Float32Array(4);
  const scratch = document.createElement('canvas');
  scratch.width = scratch.height = SOCKET_TILE;
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true })!;
  const tiles = new Map<string, Uint8Array<ArrayBuffer>>();
  const tileOf = (mark: EyeMark, key: string) => {
    let tile = tiles.get(key);
    if (!tile) {
      tile = socketTile(scratchCtx, mark);
      if (tiles.size >= 48) tiles.delete(tiles.keys().next().value!);
      tiles.set(key, tile);
    }
    return tile;
  };

  const readColor = colorReader();
  const shown = {
    baked: null as BakedShape | null,
    view: null as ViewBasis | null,
    pixels: 0,
    color: '',
    ink: '',
    regions: new Float32Array(8),
    contours: ['', ''],
  };

  return (shape, view, look, scale) => {
    if (gl.isContextLost()) return null;
    const baked = shapeOf(shape, scale >= 1.4);
    const { cx, cy, radius } = baked;
    const pixels = Math.min(MAX_PIXELS, Math.max(MIN_PIXELS, Math.ceil(2 * radius * scale)));
    if (canvas.width < pixels) canvas.width = canvas.height = pixels;
    const image = { canvas, x: 0, y: canvas.height - pixels, size: pixels, cx, cy, radius };

    const eyeZ = 'eyeZ' in shape ? shape.eyeZ : [];
    regions.fill(0);
    const contours = ['', ''];
    look.eyes.forEach(({ mark, dx, dy }, slot) => {
      const region = socketRegion(mark);
      regions.set([region.cx + dx, region.cy + dy, region.span, (eyeZ[slot] ?? 0) + SOCKET_RISE], 4 * slot);
      sizes.set([region.w, region.h * exposedHeight(region.w, region.h)], 2 * slot);
      contours[slot] = socketKey(mark);
    });

    const turn = shown.view
      ? Math.abs(view.cY - shown.view.cY) + Math.abs(view.sY - shown.view.sY) + Math.abs(view.sP - shown.view.sP) + Math.abs(view.cP - shown.view.cP)
      : Infinity;
    if (
      shown.baked === baked && shown.pixels === pixels && shown.color === look.color && shown.ink === look.ink &&
      contours.every((k, slot) => k === shown.contours[slot]) && regions.every((v, i) => v === shown.regions[i]) &&
      turn < SAME_VIEW / (radius * scale)
    ) {
      return image;
    }

    shown.baked = baked;
    shown.view = view;
    shown.pixels = pixels;
    shown.color = look.color;
    shown.ink = look.ink;
    shown.regions.set(regions);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, eyeTex);
    look.eyes.forEach(({ mark }, slot) => {
      if (contours[slot] === shown.contours[slot]) return;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, slot * SOCKET_TILE, 0, SOCKET_TILE, SOCKET_TILE, gl.RED, gl.UNSIGNED_BYTE, tileOf(mark, contours[slot]));
    });
    shown.contours = contours;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, baked.texture ?? dummyTex);

    gl.uniform4fv(u.eyeRegion, regions);
    gl.uniform2fv(u.eyeSize, sizes);
    gl.uniform3fv(u.boxMin, baked.boxMin);
    gl.uniform3fv(u.boxSpan, baked.boxSpan);
    gl.uniform2fv(u.voxelStep, baked.voxelStep);
    gl.uniform3f(u.pivot, cx, cy, 0);
    gl.uniform1f(u.radius, radius);
    gl.uniform1f(u.halfDepth, baked.halfDepth);
    gl.uniform1f(u.bottomY, baked.bottomY);
    gl.uniform1f(u.pixelSize, (2 * radius) / pixels);
    gl.uniform1i(u.isCapsule, baked.capsule ? 1 : 0);
    gl.uniform2fv(u.capsuleDims, baked.capsuleDims);

    const [r, g, b] = readColor(look.color);
    gl.uniform3f(u.color, r / 255, g / 255, b / 255);
    const [inkR, inkG, inkB] = readColor(look.ink);
    gl.uniform3f(u.ink, inkR / 255, inkG / 255, inkB / 255);
    gl.uniformMatrix3fv(u.view, false, [view.cY, view.sY * view.sP, -view.sY * view.cP, 0, view.cP, view.sP, view.sY, -view.cY * view.sP, view.facing]);

    gl.viewport(0, 0, pixels, pixels);
    gl.scissor(0, 0, pixels, pixels);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return image;
  };
}

let renderer: Renderer | null | undefined;

export function renderGlass(shape: GlassShape, view: ViewBasis, look: GlassLook, scale: number): GlassImage | null {
  if (renderer === undefined) {
    renderer = null;
    try {
      renderer = createRenderer(() => (renderer = undefined));
    } catch (error) {
      console.warn('open-bot-avatar: glass is unavailable, drawing flat', error);
    }
  }
  return renderer?.(shape, view, look, scale) ?? null;
}
