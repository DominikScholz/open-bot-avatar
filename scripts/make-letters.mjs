// Generates gallery/letter-*.json: draws each letter, smooths it, fits curves, and validates the result.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fitCurve = createRequire(import.meta.url)('fit-curve');
const repoCore = path.join(root, 'packages/core');
const { validateAvatar } = await import(pathToFileURL(path.join(repoCore, 'src/index.ts')).href);

const SS = 3, N = 230 * SS, SIGMA = 5 * SS, TOL = 0.12, K = 0.42;

const polar = (rx, ry, n, dents, taper = 0) => (x, y) => {
  const ux = x / 100, uy = y / 100;
  const xx = taper ? ux / (1 - taper * (uy / ry + 1) / 2) : ux;
  const a = Math.atan2(uy, xx), c = Math.cos(a), s = Math.sin(a), t = a * 180 / Math.PI;
  let R = Math.pow(Math.pow(Math.abs(c / rx), n) + Math.pow(Math.abs(s / ry), n), -1 / n);
  for (const [ang, dep, w, p = 1.5] of dents) {
    const D = Math.abs(((t - ang) % 360 + 540) % 360 - 180);
    R *= 1 - dep * Math.exp(-Math.pow(D / w, p));
  }
  return Math.hypot(xx, uy) <= R;
};
const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx * 100) / (rx * 100)) ** 2 + ((y - cy * 100) / (ry * 100)) ** 2 <= 1;
const cap = (x1, y1, x2, y2, w) => (x, y) => {
  const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy) <= w / 2;
};
const box = (x0, y0, x1, y1, r) => (x, y) => {
  const qx = Math.abs(x - (x0 + x1) / 2) - (x1 - x0) / 2 + r, qy = Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
};
const dome = (x, y) => {
  if (Math.abs(x) > 84 || y < -92 || y > 92) return false;
  if (y < -8) return x * x + (y + 8) * (y + 8) <= 84 * 84;
  if (y > 66 && Math.abs(x) > 58) return (Math.abs(x) - 58) ** 2 + (y - 66) ** 2 <= 26 * 26;
  return true;
};
const dee = (x, y) => {
  if (y < -94 || y > 94 || x < -84) return false;
  if (x >= 0) return (x / 88) ** 2 + (y / 94) ** 2 <= 1;
  if (x < -70 && Math.abs(y) > 80) return (x + 70) ** 2 + (Math.abs(y) - 80) ** 2 <= 14 * 14;
  return true;
};

const tri = (a, b, c) => (x, y) => {
  const s = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
// Pulls a shape inward along one direction, the same dent polar() makes.
const dent = (fn, ang, dep, w, p = 1.5) => (x, y) => {
  const t = Math.atan2(y, x) * 180 / Math.PI, D = Math.abs(((t - ang) % 360 + 540) % 360 - 180);
  const k = 1 - dep * Math.exp(-Math.pow(D / w, p));
  return fn(x / k, y / k);
};
const shift = (fn, dx, sx) => (x, y) => fn((x - dx) / sx, y);
const flip = fn => (x, y) => fn(x, -y);
const vee = polar(1, .94, 3.4, [[-90, .56, 17, 1.25]], .58);
const fatVee = polar(1, .94, 3.4, [[-90, .4, 17, 1.25]], .46);
const wTrap = polar(1, .92, 2.6, [[-118, .44, 10, 1.25], [-62, .44, 10, 1.25], [90, .42, 12]], .3);

// Closed smooth curve through traced sketch points, centered and scaled to draft units.
const spline = (pts, scale, stretchY = 1) => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const q = pts.map(p => [(p[0] - cx) * scale, (p[1] - cy) * scale * stretchY]);
  const poly = [];
  for (let i = 0; i < q.length; i++) {
    const a = q[(i - 1 + q.length) % q.length], b = q[i], c = q[(i + 1) % q.length], d = q[(i + 2) % q.length];
    for (let k = 0; k < 8; k++) {
      const t = k / 8, t2 = t * t, t3 = t2 * t;
      poly.push([0, 1].map(j => .5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t3)));
    }
  }
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) inside = !inside;
    }
    return inside;
  };
};
const mHalf = [[0,-52],[22,-62],[48,-74],[72,-62],[90,-22],[98,28],[94,60],[74,76],[54,70],[38,48],[24,38],[11,48],[0,52]];
const mSketch = spline([...mHalf, ...mHalf.slice(1, -1).reverse().map(([x, y]) => [-x, y])], .88, 1.39);
const lBlob = spline([[-76,-60],[-60,-86],[-32,-94],[-6,-86],[10,-60],[14,-20],[24,10],[50,28],[76,40],[88,62],[76,84],[44,92],[0,94],[-44,92],[-70,74],[-82,40],[-80,0]], 1);
const jSketch = spline([[-42,-76],[-16,-86],[20,-90],[52,-78],[70,-48],[82,-8],[88,30],[82,60],[60,80],[20,90],[-24,90],[-62,76],[-84,50],[-88,24],[-74,8],[-46,8],[-16,8],[-6,-8],[-10,-26],[-26,-38],[-42,-46],[-52,-60]], 1);

// shape, cuts, eye pair [x, y, spacing, scale] in draft units (spacing and scale in contract units)
const L = {
  A: [[dent(dome, 90, .44, 12)], [], [0, -14, 14, 1]],
  B: [[polar(.86, .94, 3, [[6, .2, 15]])], [], [-8, -8, 14, 1]],
  C: [[polar(.92, .92, 2, [[0, .6, 17, 2]])], [], [-30, -6, 13, 1]],
  D: [[dee], [], [0, -6, 14, 1]],
  E: [[shift(polar(.62, .94, 2.6, []), -24, 1), ell(.2, -.62, .66, .31), ell(.16, 0, .6, .29), ell(.2, .62, .66, .31)], [], [-20, 0, 14, 1]],
  F: [[polar(.82, .94, 2.6, [[-2, .36, 10], [48, .48, 26, 2]])], [], [-20, -30, 13, 1]],
  G: [[polar(.92, .92, 2, [])], [cap(120, -14, 50, -14, 22), cap(50, -14, 50, 16, 22)], [-34, 0, 14, 1]],
  H: [[polar(.86, .94, 2.6, [[-90, .44, 14], [90, .44, 14]])], [], [0, 0, 15, 1]],
  I: [[ell(0, -.68, .76, .28), ell(0, .68, .76, .28), box(-42, -70, 42, 70, 10)], [], [0, 0, 12, 1]],
  J: [[jSketch], [], [36, -12, 14, 1]],
  K: [[cap(-52, -58, -52, 58, 76), cap(-30, 0, 54, -56, 76), cap(-30, 0, 54, 56, 76)], [], [-18, 0, 14, 1]],
  L: [[lBlob], [], [-32, -18, 13, 1]],
  M: [[mSketch], [], [0, -8, 15, 1]],
  N: [[polar(.94, .86, 3, [])], [tri([-10, -115], [42, -115], [42, -28]), tri([10, 115], [-42, 115], [-42, 28])], [0, 0, 14, 1]],
  O: [[polar(.96, .9, 2, [])], [], [0, -6, 14, 1]],
  P: [[polar(.86, .94, 2.5, [[50, .54, 28, 2]])], [], [-8, -26, 14, 1]],
  Q: [[polar(.9, .88, 2, [[46, -.3, 11, 2]])], [], [-4, -6, 14, 1]],
  R: [[polar(.86, .94, 2.6, [[14, .24, 11], [90, .44, 12], [54, -.1, 14, 2]])], [], [-8, -26, 14, 1]],
  S: [[polar(.86, .94, 2.4, [[-24, .52, 12], [156, .52, 12]])], [], [-4, -4, 14, 1]],
  T: [[ell(0, -.58, .94, .36), cap(0, -44, 0, 46, 94)], [], [0, -10, 14, 1]],
  U: [[polar(.88, .94, 2.3, [[-90, .56, 15, 2]])], [], [0, 26, 14, 1]],
  V: [[vee], [], [0, 24, 12, 1]],
  W: [[flip(mSketch)], [], [0, 8, 15, 1]],
  X: [[ell(-.44, -.44, .54, .5), ell(.44, -.44, .54, .5), ell(-.44, .44, .54, .5), ell(.44, .44, .54, .5), ell(0, 0, .6, .6)], [], [0, 0, 15, 1]],
  Y: [[polar(.92, .94, 2.2, [[-90, .44, 13], [32, .42, 24, 2], [148, .42, 24, 2]])], [], [0, -8, 14, 1]],
  Z: [[cap(-56, -64, 56, -64, 60), cap(-56, 64, 56, 64, 60), tri([86, -62], [-30, -62], [-86, 32]), tri([86, -62], [-86, 32], [-86, 62]), tri([86, -62], [-86, 62], [30, 62]), tri([86, -62], [30, 62], [86, -32])], [], [0, 0, 14, 1]],
};

const rad = Math.ceil(SIGMA * 3), kern = [];
let total = 0;
for (let i = -rad; i <= rad; i++) { const v = Math.exp(-i * i / (2 * SIGMA * SIGMA)); kern.push(v); total += v; }
kern.forEach((_, i) => kern[i] /= total);
function blur(src) {
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (let k = -rad; k <= rad; k++) { const xx = x + k; if (xx >= 0 && xx < N) v += src[y * N + xx] * kern[k + rad]; }
    tmp[y * N + x] = v;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (let k = -rad; k <= rad; k++) { const yy = y + k; if (yy >= 0 && yy < N) v += tmp[yy * N + x] * kern[k + rad]; }
    out[y * N + x] = v;
  }
  return out;
}
function contour(f) {
  const next = new Map(), pts = new Map();
  const P = (x, y, e) => {
    const k = `${x},${y},${e}`;
    if (!pts.has(k)) {
      const a = f[y * N + x], b = e ? f[(y + 1) * N + x] : f[y * N + x + 1], t = (.5 - a) / (b - a);
      pts.set(k, e ? [x, y + t] : [x + t, y]);
    }
    return k;
  };
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
    const c = (f[y * N + x] > .5 ? 8 : 0) | (f[y * N + x + 1] > .5 ? 4 : 0) | (f[(y + 1) * N + x + 1] > .5 ? 2 : 0) | (f[(y + 1) * N + x] > .5 ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const t = () => P(x, y, 0), r = () => P(x + 1, y, 1), b = () => P(x, y + 1, 0), l = () => P(x, y, 1);
    const add = (A, B) => next.set(A(), B());
    switch (c) {
      case 1: add(l, b); break; case 2: add(b, r); break; case 3: add(l, r); break;
      case 4: add(r, t); break; case 5: add(l, t); add(r, b); break; case 6: add(b, t); break;
      case 7: add(l, t); break; case 8: add(t, l); break; case 9: add(t, b); break;
      case 10: add(t, r); add(b, l); break; case 11: add(t, r); break; case 12: add(r, l); break;
      case 13: add(r, b); break; case 14: add(b, l); break;
    }
  }
  const loops = [];
  while (next.size) {
    const start = next.keys().next().value;
    let k = start;
    const loop = [];
    while (next.has(k)) { loop.push(pts.get(k)); const n = next.get(k); next.delete(k); k = n; }
    loops.push(loop);
  }
  return loops.sort((a, b) => b.length - a.length);
}

const defs = {};
let bad = 0;
for (const [ch, [adds, cuts, eye]] of Object.entries(L)) {
  const src = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = (x + .5) / SS - 115, py = (y + .5) / SS - 115;
    src[y * N + x] = adds.some(s => s(px, py)) && !cuts.some(s => s(px, py)) ? 1 : 0;
  }
  const loops = contour(blur(src));
  const main = loops[0].map(p => [50 + ((p[0] + .5) / SS - 115) * K, 50 + ((p[1] + .5) / SS - 115) * K]);
  let top = 0;
  main.forEach((p, i) => { if (p[1] < main[top][1]) top = i; });
  const rot = main.slice(top).concat(main.slice(0, top)).filter((_, i) => i % 3 === 0);
  rot.push(rot[0].slice());
  const curves = fitCurve(rot, TOL);
  const f = curves[0], l = curves[curves.length - 1], s = f[0];
  const vx = f[1][0] - l[2][0], vy = f[1][1] - l[2][1], len = Math.hypot(vx, vy) || 1;
  const lf = Math.hypot(f[1][0] - s[0], f[1][1] - s[1]), ll = Math.hypot(l[2][0] - s[0], l[2][1] - s[1]);
  f[1] = [s[0] + vx / len * lf, s[1] + vy / len * lf];
  l[2] = [s[0] - vx / len * ll, s[1] - vy / len * ll];
  l[3] = s.slice();
  const r = v => +v.toFixed(2);
  let d = `M${r(s[0])} ${r(s[1])}`;
  for (const c of curves) d += `C${r(c[1][0])} ${r(c[1][1])} ${r(c[2][0])} ${r(c[2][1])} ${r(c[3][0])} ${r(c[3][1])}`;
  d += 'Z';
  const def = {
    version: 1,
    id: `letter-${ch.toLowerCase()}`,
    name: `Letter ${ch}`,
    body: { path: d },
    eyes: { x: r(50 + eye[0] * K), y: r(50 + eye[1] * K), spacing: eye[2], scale: eye[3] },
  };
  const res = validateAvatar(def);
  if (!res.ok) { bad++; console.log(ch, 'INVALID', res.errors.join(' | ')); }
  else console.log(ch, 'ok', `loops=${loops.length}`, `anchors=${curves.length}`);
  defs[ch] = def;
}
for (const def of Object.values(defs)) fs.writeFileSync(path.join(root, 'gallery', `${def.id}.json`), `${JSON.stringify(def, null, 2)}\n`);
console.log('invalid:', bad);
