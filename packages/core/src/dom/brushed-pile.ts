// A height field shared by the opaque undercoat and its raised shells. Filter
// noise along the groom so neighboring fibers form soft, continuous streaks.
export function brushedPile(size: number): Uint8Array {
  const count = size * size;
  let field = new Float32Array(count);
  let next = new Float32Array(count);
  const dx = new Float32Array(count), dy = new Float32Array(count);
  let seed = 73021;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    field[i] = seed / 4294967296 - .5;
    const bend = .20 * Math.sin(x * .024 + y * .018) + .13 * Math.sin(y * .056 - x * .030);
    const rx = x - size / 2, ry = y - size / 2;
    const angle = Math.atan2(ry, rx) + bend;
    // Near the crown the pile points toward the viewer and foreshortens.
    const stretch = .25 + .75 * Math.min(1, Math.hypot(rx, ry) / (size * .12));
    dx[i] = Math.cos(angle) * stretch;
    dy[i] = Math.sin(angle) * stretch;
  }

  function sample(x: number, y: number) {
    x = Math.max(0, Math.min(size - 1.001, x));
    y = Math.max(0, Math.min(size - 1.001, y));
    const ix = Math.floor(x), iy = Math.floor(y), i = iy * size + ix;
    const u = x - ix, v = y - iy;
    return (field[i] * (1 - u) + field[i + 1] * u) * (1 - v)
      + (field[i + size] * (1 - u) + field[i + size + 1] * u) * v;
  }

  // Successively longer passes extend the footprint while following
  // the local bend. The coarser sample below groups fine fibers into locks.
  const shortNap = new Float32Array(count);
  for (const step of [1, 2, 4, 8, 12]) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      next[i] = .5 * (field[i] + sample(x + dx[i] * step, y + dy[i] * step));
    }
    [field, next] = [next, field];
    if (step === 4) shortNap.set(field);
  }
  const pixels = new Uint8Array(count);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const lock = sample(size * .25 + x * .5, size * .25 + y * .5);
    const radius = Math.hypot(x - size / 2, y - size / 2);
    const sweep = Math.min(1, radius / (size * .10));
    const height = .5 + .9 * shortNap[i] + sweep * (2.1 * field[i] + lock);
    pixels[i] = Math.round(255 * Math.max(0, Math.min(1, height)));
  }
  return pixels;
}
