/**
 * The liquid gradient. One small WebGL canvas draws every fill in turn: it warps space with layered
 * sine waves, then blends four colors across the result in OKLab, so the colors swirl without
 * turning muddy where they meet. Browsers without WebGL get soft drifting color blobs instead.
 */
const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform vec3 stops[4];
uniform float seed;
uniform float time;

vec3 toSrgb(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 linear = clamp(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0, 1.0);
  return mix(12.92 * linear, 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, linear));
}

void main() {
  vec2 q = (uv * 2.0 - 1.0) * 1.5 + seed;
  for (int i = 0; i < 4; i++) {
    float f = float(i);
    q += 0.55 * sin(q.yx * (1.1 + f * 0.35) + vec2(time * 0.5, -time * 0.4) + f * 1.9);
  }
  float a = smoothstep(-1.0, 1.0, sin(q.x * 1.1));
  float b = smoothstep(-1.0, 1.0, sin(q.y * 1.1 + 0.8 * (uv.y - 0.5)));
  color = vec4(toSrgb(mix(mix(stops[0], stops[1], a), mix(stops[2], stops[3], a), b)), 1.0);
}`;

/** "#rrggbb" to OKLab. */
export function toOklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(n >> 16), g = lin((n >> 8) & 255), b = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export const FILL_SIZE = 96;

interface Fluid {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  stops: WebGLUniformLocation;
  seed: WebGLUniformLocation;
  time: WebGLUniformLocation;
}
let fluid: Fluid | null | undefined;

function setUp(): Fluid | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FILL_SIZE;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type) as WebGLShader;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  return {
    gl,
    canvas,
    stops: gl.getUniformLocation(program, 'stops') as WebGLUniformLocation,
    seed: gl.getUniformLocation(program, 'seed') as WebGLUniformLocation,
    time: gl.getUniformLocation(program, 'time') as WebGLUniformLocation,
  };
}

function drawBlobs(ctx: CanvasRenderingContext2D, stops: string[], seed: number, t: number) {
  const scale = FILL_SIZE / 128;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = stops[1];
  ctx.fillRect(0, 0, 128, 128);
  stops.forEach((col, n) => {
    const a = seed + n * 1.57 + t * (0.35 + n * 0.08);
    const x = 50 + Math.cos(a) * 34, y = 50 + Math.sin(a * 1.2 + n) * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 52);
    g.addColorStop(0, col);
    g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Paints one frame of a fill onto `ctx`. */
export function drawFill(ctx: CanvasRenderingContext2D, stops: string[], seed: number, t: number) {
  if (fluid === undefined) fluid = setUp();
  if (!fluid || fluid.gl.isContextLost()) {
    drawBlobs(ctx, stops, seed, t);
    return;
  }
  const { gl, canvas } = fluid;
  gl.uniform3fv(fluid.stops, stops.flatMap(toOklab));
  gl.uniform1f(fluid.seed, seed);
  gl.uniform1f(fluid.time, t);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(canvas, 0, 0);
}
