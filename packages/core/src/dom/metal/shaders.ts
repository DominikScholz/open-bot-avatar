/**
 * Ray-marched brushed and anodized metal over a sampled 3D distance field.
 * Uses conductor Fresnel with an F82 edge-tint dip, a high-contrast studio light tent
 * with dark flags and HDR strip softboxes, subtle anisotropic brushed micro-grain,
 * SDF ambient occlusion, 1-bounce self-reflection on concave parts, and precision
 * countersunk eye bezels with glossy obsidian lens beads.
 */
import { SOCKET_PAD } from '../materials/socket.ts';

const float = (n: number) => (Number.isInteger(n) ? `${n}.` : `${n}`);

export const vertexShader = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[](vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.));
out vec2 vNdc;
void main() {
  gl_Position = vec4(POS[gl_VertexID], 0., 1.);
  vNdc = POS[gl_VertexID];
}`;

export const fragmentShader = `#version 300 es
precision highp float;
precision highp int;

in vec2 vNdc;
out vec4 result;

uniform highp sampler3D volumeField; // R16F 3D SDF (positive inside, z >= 0 mirrored)
uniform highp sampler2D eyeField;    // socket.ts signed distance tiles
uniform vec3 boxMin;                 // (x0, y0, z0) in viewBox units
uniform vec3 boxSpan;                // (spanX, spanY, spanZ) in viewBox units
uniform vec2 voxelStep;              // (stepXY, stepZ) for smooth normal gradients
uniform vec3 pivot;                  // (cx, cy, 0) in viewBox units
uniform float radius;                // half-size of orthographic render square, viewBox units
uniform float pixelSize;             // viewBox units per pixel
uniform int isCapsule;               // 1 for state marks (thinking dots / blocked bar)
uniform vec2 capsuleDims;            // (radius, halfStem) for capsule marks
uniform mat3 view;                   // yaw-then-pitch rotation matrix (model -> screen, Y-down)
uniform vec3 color;                  // body sRGB color (0..1)
uniform vec3 ink;                    // eye ink sRGB color (0..1)
uniform vec4 eyeRegion[2];           // face-plane center, square span, max host depth
uniform vec2 eyeSize[2];

const float FAR = ${float(SOCKET_PAD)};

// Exact 3D Signed Distance (negative inside, positive outside) directly from Volume.parts.
float mapSDF(vec3 p) {
  if (isCapsule == 1) {
    vec3 q = p - pivot;
    q.y -= clamp(q.y, -capsuleDims.y, capsuleDims.y);
    return length(q) - capsuleDims.x;
  }
  vec3 q = vec3(p.x, p.y, abs(p.z));
  vec3 boxMax = boxMin + boxSpan;
  vec3 cl = clamp(q, boxMin, boxMax);
  vec3 outVec = q - cl;
  float outDist = length(outVec);

  vec3 texSize = vec3(textureSize(volumeField, 0));
  vec3 norm = (cl - boxMin) / boxSpan;
  vec3 uvw = (norm * (texSize - 1.0) + 0.5) / texSize;
  float sdInsidePos = texture(volumeField, uvw).r;

  if (outDist > 0.0001) {
    return max(-sdInsidePos, 0.0) + outDist;
  }
  return -sdInsidePos;
}

vec3 calcNormalStride(vec3 p, float mult) {
  if (isCapsule == 1) {
    const float e = 0.12;
    return normalize(vec3(
      mapSDF(p + vec3(e, 0., 0.)) - mapSDF(p - vec3(e, 0., 0.)),
      mapSDF(p + vec3(0., e, 0.)) - mapSDF(p - vec3(0., e, 0.)),
      mapSDF(p + vec3(0., 0., e)) - mapSDF(p - vec3(0., 0., e))
    ));
  }
  float hx = voxelStep.x * mult;
  float hz = voxelStep.y * mult;
  vec3 g = vec3(
    (mapSDF(p + vec3(hx, 0., 0.)) - mapSDF(p - vec3(hx, 0., 0.))) / hx,
    (mapSDF(p + vec3(0., hx, 0.)) - mapSDF(p - vec3(0., hx, 0.))) / hx,
    (mapSDF(p + vec3(0., 0., hz)) - mapSDF(p - vec3(0., 0., hz))) / hz
  );
  float len = length(g);
  return len > 1e-5 ? g / len : vec3(0.0, 0.0, 1.0);
}

vec3 calcNormal(vec3 p) {
  return calcNormalStride(p, 0.90);
}

// 4-tap SDF ambient occlusion for crisp machined crevices and multi-part joints.
float calcAO(vec3 p, vec3 n) {
  if (isCapsule == 1) return 1.0;
  float ao = 1.0;
  float w = 0.62;
  for (int i = 1; i <= 4; i++) {
    float fi = float(i);
    float dist = 0.52 * fi + 0.24 * fi * fi;
    float d = mapSDF(p + n * dist);
    ao -= clamp((dist - d) / dist, 0.0, 1.0) * w;
    w *= 0.54;
  }
  return clamp(ao, 0.28, 1.0);
}

// Eye socket distance field (same coordinates as fluffy and glass).
float socketDistance(vec3 p, vec3 normal, out vec2 uv, out vec3 local) {
  uv = vec2(0.);
  local = vec3(0.);
  if (normal.z < 0.05 || p.z < 0.0) return FAR;
  for (int i = 0; i < 2; i++) {
    vec4 e = eyeRegion[i];
    vec2 delta = p.xy - e.xy;
    if (e.z > 0. && p.z <= e.w + 5.0 && max(abs(delta.x), abs(delta.y)) < e.z * 0.49) {
      vec2 coords = delta / e.z;
      vec2 sampleUV = (coords + 0.5 + vec2(float(i), 0.)) * vec2(0.5, 1.0);
      float d = (textureLod(eyeField, sampleUV, 0.).r - 0.5) * ${float(2 * SOCKET_PAD)};
      if (d >= 3.6) continue;
      uv = sampleUV;
      local.xy = 2.0 * delta / max(eyeSize[i], vec2(0.01));
      local.z = smoothstep(0.35, 1.5, eyeSize[i].y / max(0.01, eyeSize[i].x));
      return d;
    }
  }
  return FAR;
}

// Smooth studio softbox lobe with roughness-aware feathering.
float softbox(vec3 dir, vec3 center, vec2 halfSize, float softness, float tilt) {
  vec3 c = normalize(center);
  float f = dot(dir, c);
  if (f <= 0.05) return 0.0;
  vec3 up = abs(c.y) < 0.92 ? vec3(0., -1., 0.) : vec3(1., 0., 0.);
  vec3 u = normalize(cross(up, c));
  vec3 v = cross(c, u);
  vec2 proj = vec2(dot(dir, u), dot(dir, v)) / max(f, 0.22);
  float ct = cos(tilt), st = sin(tilt);
  proj = mat2(ct, -st, st, ct) * proj;
  vec2 q = abs(proj) - halfSize;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(-softness, softness, dist);
}

// Conductor Fresnel with subtle F82 edge-tint dip near ~80 deg grazing.
vec3 fresnelMetal(float cosTheta, vec3 F0) {
  float x = clamp(1.0 - cosTheta, 0.0, 1.0);
  float x2 = x * x;
  float x5 = x2 * x2 * x;
  vec3 schlick = F0 + (vec3(1.0) - F0) * x5;
  // cosTheta * (1 - cosTheta)^5 peaks at ~0.067 around cosTheta = 1/6 (~80 deg).
  float f82Dip = (cosTheta * x5) / 0.067;
  vec3 edgeDarken = mix(vec3(0.18), vec3(0.08), F0);
  return max(schlick - edgeDarken * f82Dip * F0, F0 * 0.12);
}

// Subtle procedural 3D brushed-metal grain in model space (locks to the body as it turns).
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Fine horizontal machined hairline brush grain (high frequency in Y, elongated cleanly in X/Z).
float brushGrain(vec3 p) {
  vec3 q = p - pivot;
  float horiz = q.x * 0.055 + q.z * 0.055;
  float g1 = valueNoise2(vec2(horiz, q.y * 4.80));
  float g2 = valueNoise2(vec2(horiz * 2.1 + 17.1, q.y * 10.50));
  return (g1 * 0.62 + g2 * 0.38) - 0.5;
}

// High-contrast photographic studio light tent (Y-down screen space: -Y is up, +Z is toward viewer).
// Parameterized by roughness r in [0..1] so the same physical light setup yields both crisp polish
// reflections and silky satin anisotropic metallic sheen.
vec3 sampleMetalEnv(vec3 dirS, float r) {
  vec3 d = normalize(dirS);
  // Gently tilted horizon creates a dynamic diagonal metallic sweep across upright faces.
  float h = -d.y - 0.18 * d.x;
  float blur = mix(0.045, 0.38, r);

  // Sculpted studio cyclorama: dark floor -> luminous horizon bounce -> deep dark contrast flag -> lit upper vault.
  vec3 darkFlag    = vec3(0.028, 0.032, 0.042);
  vec3 floorBounce = vec3(0.24, 0.25, 0.28);
  vec3 horizonGlow = vec3(0.56, 0.58, 0.64);
  vec3 upperVault  = vec3(0.20, 0.22, 0.27);

  float floorBand = smoothstep(-0.88, -0.26, h) * (1.0 - smoothstep(-0.22, 0.04, h));
  float darkBand  = smoothstep(-0.20, 0.02, h) * (1.0 - smoothstep(0.10, 0.38, h));
  float skyBand   = smoothstep(0.06, 0.62, h);

  vec3 col = mix(floorBounce, upperVault, skyBand);
  col = mix(col, horizonGlow, floorBand * mix(0.76, 0.40, r));
  // Deep negative-fill studio flag just across eye level gives unmistakable chrome/anodized depth & contrast.
  col = mix(col, darkFlag, darkBand * mix(0.92, 0.56, r));

  // Broad energy attenuation as roughness spreads light over a wider cone.
  float gain = mix(1.0, 0.34, r);

  // 1. Primary Overhead-Left Key Window (sweeps diagonally across the upper-left crown & cheek)
  float keyFront  = softbox(d, vec3(-0.44, -0.54, 0.72), vec2(0.46, 0.20), 0.11 + blur * 0.62, -0.48);
  // 2. Crisp Upper-Left Rim Softbox (catches upper-left bevel & curved top edges)
  float keyTop    = softbox(d, vec3(-0.46, -0.78, -0.42), vec2(0.68, 0.17), 0.09 + blur * 0.52, -0.32);
  // 3. Secondary Upper-Right Accent Strip (keeps the right shoulder gleaming)
  float rightFill = softbox(d, vec3(0.58, -0.46, 0.67), vec2(0.20, 0.40), 0.12 + blur * 0.58, 0.36);
  // 4. Vertical Left Side Strip (long sleek metallic streak down the left edge)
  float leftStrip = softbox(d, vec3(-0.92, -0.06, 0.38), vec2(0.13, 0.62), 0.09 + blur * 0.44, 0.08);
  // 5. Vertical Right Back-Rim Strip (crisp cool silver rim separating the right silhouette from #111)
  float rightRim  = softbox(d, vec3(0.88, -0.10, -0.46), vec2(0.17, 0.68), 0.10 + blur * 0.48, -0.06);
  // 6. Left Back-Rim Strip (separates left silhouette cleanly when turned)
  float leftRim   = softbox(d, vec3(-0.88, 0.08, -0.46), vec2(0.15, 0.58), 0.10 + blur * 0.48, 0.10);
  // 7. Soft Lower-Right Tabletop Kicker (gentle upward sheen on the lower bevel)
  float lowKick   = softbox(d, vec3(0.38, 0.72, 0.58), vec2(0.54, 0.16), 0.20 + blur * 0.72, 0.24);
  // 8. Top Crown Hair Light (lights ears, stems, hat tips and rims from behind)
  float crownRim  = softbox(d, vec3(0.06, -0.92, -0.38), vec2(0.64, 0.13), 0.10 + blur * 0.52, 0.06);

  // Subtle warm-key / cool-fill photographic color temperature contrast.
  vec3 warmLight = vec3(1.03, 1.00, 0.96);
  vec3 coolLight = vec3(0.94, 0.98, 1.05);

  col += warmLight * (keyFront * 2.75 + keyTop * 2.95 + lowKick * 0.75) * gain;
  col += coolLight * (rightFill * 1.50 + leftStrip * 2.25 + rightRim * 2.45 + leftRim * 2.05 + crownRim * 2.25) * gain;

  // Gentle front satin fill so the center of broad faces stays alive without washing out silver contrast.
  float frontSoft = pow(max(0.0, dot(d, normalize(vec3(-0.26, -0.38, 0.89)))), mix(4.6, 1.9, r));
  col += warmLight * frontSoft * mix(0.20, 0.42, r);

  return col;
}

// Evaluate dual-lobe anisotropic brushed metal reflection (satin brushed body + crisp machined polish).
vec3 shadeMetalSurface(vec3 nS, vec3 rdS, vec3 F0, float brush, float brushFade, float ao) {
  float cos1 = clamp(dot(-rdS, nS), 0.0, 1.0);
  vec3 F = fresnelMetal(cos1, F0);
  vec3 reflS = reflect(rdS, nS);

  // Anisotropic stretch perpendicular to horizontal brush lines (stretches highlights along screen-Y/up tangent).
  vec3 upRef = abs(nS.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangentX = normalize(cross(upRef, nS));
  vec3 bitangentY = cross(nS, tangentX);

  float aniso = 0.080 * (1.0 - 0.18 * brush * brushFade);
  vec3 reflUp = normalize(reflS + bitangentY * aniso);
  vec3 reflDn = normalize(reflS - bitangentY * aniso);

  // Primary satin brushed metallic lobe (3-tap anisotropic filter).
  float rSatin = clamp(0.42 + 0.06 * brush * brushFade, 0.34, 0.56);
  vec3 satinEnv = 0.50 * sampleMetalEnv(reflS, rSatin) +
                  0.25 * sampleMetalEnv(reflUp, rSatin) +
                  0.25 * sampleMetalEnv(reflDn, rSatin);

  // Secondary crisp polished sheen lobe (gives razor-bright metallic bevel glints).
  float rPolish = clamp(0.075 + 0.03 * brush * brushFade, 0.05, 0.14);
  vec3 polishEnv = sampleMetalEnv(reflS, rPolish);

  // Blend satin body and crisp polish: bevels & grazing angles gleam sharper like machined chamfers.
  float polishMix = mix(0.42, 0.66, pow(1.0 - cos1, 1.7));
  vec3 env = mix(satinEnv, polishEnv, polishMix);

  // Subtle multi-scattering metallic bounce inside micro-roughness (keeps saturated alloys rich & luminous).
  float multiScatter = 0.095 * (0.45 + 0.55 * clamp(-nS.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = F * env * (0.98 + 0.045 * brush * brushFade) + F0 * F0 * multiScatter;

  // Apply SDF ambient occlusion (darkens concave multi-part crevices).
  float specAO = mix(ao, ao * ao, 0.38);
  col *= mix(specAO, 1.0, pow(1.0 - cos1, 3.0) * 0.35);

  // Subtle metallic rim lift so even gunmetal/dark alloys separate cleanly from the dark #111 studio ground.
  float rim = pow(1.0 - cos1, 3.4);
  col += mix(F0, vec3(0.92, 0.96, 1.0), 0.40) * (rim * 0.25 * ao);

  return col;
}

// Map sRGB body color into physically pleasing metallic F0 reflectance across the whole palette:
// White -> polished silver/chrome, Gray -> titanium/gunmetal, Amber -> brushed gold,
// Orange -> anodized copper/orange, saturated colors -> vibrant anodized aluminum,
// dark colors -> gleaming obsidian/black chrome.
vec3 metalF0Of(vec3 srgb) {
  float maxC = max(srgb.r, max(srgb.g, srgb.b));
  float minC = min(srgb.r, min(srgb.g, srgb.b));
  float sat = maxC > 0.001 ? (maxC - minC) / maxC : 0.0;

  // Perceptual power 1.65 preserves exact orange/red/gold hue fidelity without rose/brown shift.
  vec3 lin = pow(clamp(srgb, 0.0, 1.0), vec3(1.65));

  // Neutral / achromatic colors get a subtle cool silver-titanium alloy cast.
  vec3 neutralTint = vec3(0.95, 0.98, 1.03);
  float neutralRefl = mix(0.22, 0.87, smoothstep(0.0, 0.92, pow(maxC, 1.35)));
  vec3 neutralMetal = neutralTint * neutralRefl;

  // Chromatic colors stay true to their chosen hue while carrying high conductor reflectance.
  vec3 pureLin = maxC > 0.02 ? lin / max(max(lin.r, max(lin.g, lin.b)), 0.001) : vec3(1.0);
  vec3 alloyHue = mix(pureLin, vec3(1.0), 0.02);
  float chromRefl = mix(0.44, 0.94, smoothstep(0.05, 0.85, maxC));
  vec3 chromMetal = alloyHue * chromRefl;

  // Warm gold/amber alloys naturally carry slightly higher metallic brilliance.
  float warmGold = smoothstep(0.35, 0.85, srgb.r) * smoothstep(0.25, 0.70, srgb.g) * (1.0 - smoothstep(0.25, 0.55, srgb.b));
  chromMetal *= mix(1.0, 1.06, warmGold);

  float satMix = smoothstep(0.04, 0.24, sat);
  return clamp(mix(neutralMetal, chromMetal, satMix), vec3(0.015), vec3(0.96));
}

// Trace one ray onto the exact 3D Volume SDF + 1-bounce self-reflection + countersunk eyes.
vec4 traceRay(vec2 screenXY, mat3 invView, vec3 F0, float brushFade) {
  vec3 rdS = vec3(0.0, 0.0, -1.0);
  vec3 roS = vec3(screenXY, radius * 1.25);
  vec3 ro = pivot + invView * roS;
  vec3 rd = invView * rdS;

  vec3 oc = ro - pivot;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - radius * radius;
  float disc = b * b - c;
  if (disc < 0.0) return vec4(0.0);

  float tMin = max(0.0, -b - sqrt(disc));
  float tMax = -b + sqrt(disc);
  float t = tMin;
  float tPrev = tMin;
  bool hit = false;

  for (int i = 0; i < 88; i++) {
    float d = mapSDF(ro + rd * t);
    if (d <= 0.004) {
      if (d <= 0.0) {
        hit = true;
        break;
      }
      float tProbe = min(tMax, t + 0.06);
      if (mapSDF(ro + rd * tProbe) <= 0.0) {
        tPrev = t;
        t = tProbe;
        hit = true;
        break;
      }
    }
    tPrev = t;
    t += max(d * 0.80, 0.06);
    if (t > tMax) break;
  }
  if (!hit) return vec4(0.0);

  // 6-step bisection for exact surface crossing and silky smooth normals.
  float lo = tPrev, hi = t;
  for (int i = 0; i < 6; i++) {
    float mid = 0.5 * (lo + hi);
    if (mapSDF(ro + rd * mid) <= 0.0) hi = mid;
    else lo = mid;
  }
  t = hi;

  vec3 p1 = ro + rd * t;
  vec3 n1 = calcNormal(p1);
  float ao = calcAO(p1, n1);

  // Subtle horizontal brushed-metal normal perturbation (fades smoothly at small sizes to prevent shimmer).
  float brush = brushGrain(p1);
  vec3 nMetal = n1;
  if (brushFade > 0.001) {
    float bUp = brushGrain(p1 + vec3(0.0, 0.08, 0.0));
    float slope = (bUp - brush) * 0.075 * brushFade;
    nMetal = normalize(n1 + vec3(0.0, slope, 0.0));
  }

  // --- Precision Countersunk Eye Bezel + Glossy Obsidian Bead ---
  float eyeMask = 0.0;
  vec3 eyeColor = vec3(0.0);
  float socketAO = 1.0;
  if (isCapsule == 0) {
    vec2 eyeUV;
    vec3 local;
    float dEye = socketDistance(p1, n1, eyeUV, local);
    if (dEye < 2.2) {
      // Sample eye SDF gradient to tilt the surrounding metal into a precision-milled chamfered bezel.
      vec2 texel = 1.0 / vec2(textureSize(eyeField, 0));
      vec2 grad = vec2(
        textureLod(eyeField, eyeUV + vec2(texel.x, 0.0), 0.0).r - textureLod(eyeField, eyeUV - vec2(texel.x, 0.0), 0.0).r,
        textureLod(eyeField, eyeUV + vec2(0.0, texel.y), 0.0).r - textureLod(eyeField, eyeUV - vec2(0.0, texel.y), 0.0).r
      );
      float gLen = length(grad);
      vec2 outward = gLen > 1e-4 ? grad / gLen : vec2(0.0, 1.0);

      // Chamfer bevel band around the eye mouth: smoothly tilts the metal normal inward toward the eye.
      float chamferWidth = mix(0.80, 1.25, local.z);
      float bezelBand = smoothstep(chamferWidth, 0.12, dEye) * smoothstep(-0.08, 0.24, dEye);
      float chamferSlope = mix(0.36, 0.56, local.z);
      nMetal = normalize(nMetal - vec3(outward * bezelBand * chamferSlope, 0.0));

      // Tight contact crease right where the eye bead meets the machined bezel.
      socketAO = 1.0 - 0.62 * (1.0 - smoothstep(-0.05, 0.40, dEye));

      if (dEye < 0.35) {
        vec2 curve = clamp(local.xy * 0.90, vec2(-0.96), vec2(0.96));
        vec3 dome = normalize(vec3(curve, sqrt(max(0.04, 1.0 - dot(curve, curve)))));
        vec3 beadN = normalize(view * dome);
        vec3 beadRefl = reflect(rdS, beadN);
        float beadKey = softbox(beadRefl, vec3(-0.48, -0.64, 0.60), vec2(0.24, 0.30), 0.10, -0.35);
        float beadFill = softbox(beadRefl, vec3(0.62, 0.42, 0.66), vec2(0.28, 0.22), 0.16, 0.30);
        float beadRim = pow(1.0 - clamp(beadN.z, 0.0, 1.0), 2.4);
        vec3 inkLin = pow(clamp(ink, 0.0, 1.0), vec3(2.2));
        eyeColor = inkLin * (0.26 + 0.54 * clamp(beadN.z, 0.0, 1.0)) +
                   vec3(1.0, 0.99, 0.97) * (beadKey * 1.55) +
                   mix(F0, vec3(1.0), 0.45) * (beadFill * 0.38 + beadRim * 0.22);
        float aa = max(0.10, pixelSize * 1.15);
        eyeMask = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, dEye);
      }
    }
  }

  vec3 n1S = normalize(view * nMetal);
  vec3 col = shadeMetalSurface(n1S, rdS, F0, brush, brushFade, ao * socketAO);

  // --- Fast 1-Bounce Self-Reflection for Multi-Part Concave Geometry (Barbell, Mug, Sprout, etc.) ---
  if (isCapsule == 0 && eyeMask < 0.98) {
    vec3 reflM = normalize(reflect(rd, nMetal));
    if (dot(reflM, n1) > 0.12) {
      vec3 rOrigin = p1 + n1 * 0.45;
      if (mapSDF(rOrigin) > 0.08) {
        float s = 0.55;
        float sPrev = 0.0;
        bool selfHit = false;
        for (int i = 0; i < 20; i++) {
          float d = mapSDF(rOrigin + reflM * s);
          if (d <= 0.0) {
            selfHit = true;
            break;
          }
          sPrev = s;
          s += max(d * 0.85, 0.25);
          if (s > radius * 1.35) break;
        }
        if (selfHit) {
          float rLo = sPrev, rHi = s;
          for (int b = 0; b < 4; b++) {
            float mid = 0.5 * (rLo + rHi);
            if (mapSDF(rOrigin + reflM * mid) <= 0.0) rHi = mid;
            else rLo = mid;
          }
          vec3 p2 = rOrigin + reflM * rHi;
          vec3 n2S = normalize(view * calcNormalStride(p2, 1.25));
          vec3 refl2S = reflect(normalize(view * reflM), n2S);
          vec3 bounceEnv = sampleMetalEnv(refl2S, 0.42);
          float cos1 = clamp(dot(-rdS, n1S), 0.0, 1.0);
          vec3 F1 = fresnelMetal(cos1, F0);
          vec3 bounceCol = F1 * F0 * bounceEnv * 0.80;
          float blend = smoothstep(0.6, 3.0, rHi) * smoothstep(radius * 1.30, 3.5, rHi) * 0.62;
          col = mix(col, bounceCol, blend);
        }
      }
    }
  }

  // Soft photographic highlight roll-off (preserves rich metallic chroma in midtones, gleams smoothly at HDR peaks).
  float peak = max(col.r, max(col.g, col.b));
  if (peak > 0.0001) {
    // Filmic shoulder: bright linear response up to ~0.7, silky metallic roll-off into specular peaks.
    float mapped = (peak * (1.0 + 0.18 * peak)) / (1.0 + 0.72 * peak);
    mapped = clamp(mapped, 0.0, 1.0);
    col = col * (mapped / peak);
    // Subtle white-hot bloom only at the very brightest HDR softbox specular glints.
    float whiteRoll = smoothstep(1.55, 3.60, peak);
    col = mix(col, vec3(mapped), whiteRoll * 0.55);
  }

  if (eyeMask > 0.001) {
    float ePeak = max(eyeColor.r, max(eyeColor.g, eyeColor.b));
    vec3 eMapped = ePeak > 0.0001 ? eyeColor * ((ePeak / (1.0 + ePeak * 0.42)) / ePeak) : vec3(0.0);
    col = mix(col, eMapped, eyeMask);
  }

  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  return vec4(col, 1.0);
}

void main() {
  vec2 screenXY = vec2(vNdc.x, -vNdc.y) * radius;
  mat3 invView = transpose(view);
  vec3 F0 = metalF0Of(color);
  float brushFade = smoothstep(0.95, 0.25, pixelSize);

  // Trigger 2x2 rotated-grid supersampling (RGSS) near silhouette edges for razor-crisp antialiasing.
  vec3 probePos = pivot + invView * vec3(screenXY, 0.0);
  float edgeDist = abs(mapSDF(probePos));

  if (pixelSize < 0.85 && edgeDist < max(4.5, pixelSize * 4.0)) {
    vec2 o1 = vec2( 0.375,  0.125) * pixelSize;
    vec2 o2 = vec2(-0.125,  0.375) * pixelSize;
    vec2 o3 = vec2(-0.375, -0.125) * pixelSize;
    vec2 o4 = vec2( 0.125, -0.375) * pixelSize;
    result = 0.25 * (
      traceRay(screenXY + o1, invView, F0, brushFade) +
      traceRay(screenXY + o2, invView, F0, brushFade) +
      traceRay(screenXY + o3, invView, F0, brushFade) +
      traceRay(screenXY + o4, invView, F0, brushFade)
    );
  } else {
    result = traceRay(screenXY, invView, F0, brushFade);
  }
}`;
