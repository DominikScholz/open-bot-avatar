import type { EyeMark, FramePath } from '../render.ts';

export function eyeBox(mark: EyeMark): FramePath['box'] {
  if (mark.shape === 'pill') return { x: mark.x, y: mark.y, w: mark.width, h: mark.height };
  // Quadratics lie within their points' hull; an arc's stroke reaches half its width past it.
  const reach = mark.shape === 'arc' ? mark.strokeWidth : 0;
  const n = (mark.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs) - reach, y = Math.min(...ys) - reach;
  return { x, y, w: Math.max(...xs) + reach - x, h: Math.max(...ys) + reach - y };
}

export function eye(ctx: CanvasRenderingContext2D, mark: EyeMark) {
  if (mark.shape === 'path') {
    ctx.fill(new Path2D(mark.d));
    return;
  }
  if (mark.shape === 'arc') {
    ctx.lineWidth = mark.strokeWidth;
    ctx.stroke(new Path2D(mark.d));
    return;
  }
  const { x, y, width: w, height: h, radius: r } = mark;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else {
    // Safari before 16 and Firefox before 112.
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  ctx.fill();
}

// Encode distance to the animated eye contour in a small texture. Units are
// isotropic across the square, including the padding needed for the socket.
export const EYE_TILE = 96;
export const SOCKET_PAD = 3.8;
export const EXPOSED_EYE_HEIGHT = .80;
export function eyeDistanceTile(ctx: CanvasRenderingContext2D, mark: EyeMark, cx: number, cy: number, span: number) {
  const size = EYE_TILE;
  const scale = size / span;
  ctx.resetTransform();
  ctx.clearRect(0, 0, size, size);
  ctx.setTransform(scale, 0, 0, scale, size/2-cx*scale, size/2-cy*scale);
  ctx.lineCap = 'round';
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  // The surrounding nap hides a little of the top and bottom of the bead.
  ctx.translate(cx, cy);
  ctx.scale(1, EXPOSED_EYE_HEIGHT);
  ctx.translate(-cx, -cy);
  eye(ctx, mark);
  const rgba = ctx.getImageData(0, 0, size, size).data;
  const distance = new Float32Array(size*size).fill(size);
  // Start on each side of the antialiased boundary, then propagate distance.
  for (let i=size+1; i<distance.length-size-1; i++) {
    const a = rgba[i*4+3]/255;
    const inside = a >= .5;
    if ((a>0 && a<1) ||
        (rgba[(i-1)*4+3]>=128) !== inside || (rgba[(i+1)*4+3]>=128) !== inside ||
        (rgba[(i-size)*4+3]>=128) !== inside || (rgba[(i+size)*4+3]>=128) !== inside) {
      distance[i] = Math.abs(a-.5);
    }
  }
  for (const step of [1,-1]) {
    for (let j=1; j<size-1; j++) for (let k=1; k<size-1; k++) {
      const i = step===1 ? j*size+k : (size-1-j)*size+size-1-k;
      const prev = i-size*step;
      distance[i] = Math.min(distance[i], distance[i-step]+1, distance[prev]+1,
        distance[prev-1]+Math.SQRT2, distance[prev+1]+Math.SQRT2);
    }
  }
  const tile = new Uint8Array(distance.length);
  for (let i=0; i<tile.length; i++) {
    const signed = (rgba[i*4+3]>=128 ? -1 : 1)*distance[i]/scale;
    tile[i] = Math.round(255*Math.max(0, Math.min(1, .5 + signed/(2*SOCKET_PAD))));
  }
  return tile;
}
