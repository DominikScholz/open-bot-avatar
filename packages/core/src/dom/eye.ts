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
/** Open beads are partly buried. Shallower expressions retain their readable arc. */
export function exposedHeight(w: number, h: number) {
  const openness = Math.max(0, Math.min(1, h/w - 1));
  return .8 - .175 * openness;
}
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
  const { w, h } = eyeBox(mark);
  const exposure = exposedHeight(w, h);
  ctx.scale(1, exposure);
  ctx.translate(-cx, -cy);
  eye(ctx, mark);
  const rgba = ctx.getImageData(0, 0, size, size).data;
  const coverage = new Uint8Array(size*size);
  const cap = Math.min(1, w/h);
  for (let y=0; y<size; y++) {
    const v = Math.min(.9999, Math.abs((y+.5-size/2)/(scale*h*exposure/2)));
    // Round out the straight sides of the stadium into a soft bead profile.
    // Apply the same continuous warp to the in-between expression contours.
    const capY = Math.max(0, (v-1+cap)/cap);
    const stadium = Math.sqrt(1-capY*capY);
    const oval = Math.pow(1-Math.pow(v,2.2),1/2.2);
    const taper = h>w ? Math.min(1,oval/stadium) : 1;
    // A slight cant in the seated oval is most visible on an open eye.
    const cant = .040*Math.max(0,1-cap)*(y+.5-size/2);
    for (let x=0; x<size; x++) {
      const source = (x+.5-size/2-cant)/taper+size/2-.5;
      const i = Math.floor(source);
      if (i<0 || i+1>=size) continue;
      const offset = 4*(y*size+i)+3;
      coverage[y*size+x] = Math.round(rgba[offset]+(rgba[offset+4]-rgba[offset])*(source-i));
    }
  }
  const distance = new Float32Array(size*size).fill(size);
  // Start on each side of the antialiased boundary, then propagate distance.
  for (let i=size+1; i<distance.length-size-1; i++) {
    const a = coverage[i]/255;
    const inside = a >= .5;
    if ((a>0 && a<1) ||
        (coverage[i-1]>=128) !== inside || (coverage[i+1]>=128) !== inside ||
        (coverage[i-size]>=128) !== inside || (coverage[i+size]>=128) !== inside) {
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
    const signed = (coverage[i]>=128 ? -1 : 1)*distance[i]/scale;
    tile[i] = Math.round(255*Math.max(0, Math.min(1, .5 + signed/(2*SOCKET_PAD))));
  }
  return tile;
}
