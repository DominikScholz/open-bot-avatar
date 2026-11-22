// Orthographic coordinates from a soft lamp above and behind the camera-right edge.
// Both passes must use the same projection so their depths measure a distance in model units.
const backlightProjection = `
const vec3 backlight = normalize(vec3(.58, -.71, -.53));
vec3 lightProjection(vec3 p, float radius) {
  vec3 right = normalize(cross(vec3(0., 1., 0.), backlight));
  vec3 up = cross(backlight, right);
  return vec3(dot(p,right), dot(p,up), -dot(p,backlight)) / radius;
}`;

export const depthVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
uniform mat3 view;
uniform vec3 pivot;
uniform float radius;
${backlightProjection}
void main() {
  gl_Position = vec4(lightProjection(view * (position-pivot), radius), 1.);
}`;

export const depthFragment = `#version 300 es
precision highp float;
void main() {}`;

export const coatVertex = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 seed;
uniform mat3 view;
uniform vec3 pivot;
uniform vec3 extent;
uniform float radius, shell;
uniform int pass;
out vec3 P, N, V, lightCoord;
${backlightProjection}
out float tip, variation, across;

void main(){
  vec3 n=normalize(normal), p=position;
  vec3 rounded=(position-pivot)/extent;
  // Broadly bend the lighting normals across flat front faces of inflated paths.
  vec3 shadingNormal=normalize(n + .78*rounded);
  tip=0.; variation=.5; across=0.;
  if(pass==1){
    p+=n*shell*1.55;
    p.y+=shell*shell*.42;
  }
  if(pass==2){
    // Four cross-sections make a bent, tapered strand. Roots are fixed in model space.
    tip=float(gl_VertexID/2)/3.;
    across=float(gl_VertexID%2)*2.-1.;
    vec3 tangent=normalize(cross(n,abs(n.y)<.93?vec3(0,1,0):vec3(1,0,0)));
    vec3 bitangent=cross(n,tangent);
    float flow=2.3*sin(.24*p.x+.13*p.z+sin(.22*p.y))+1.3*sin(.32*p.y-.15*p.x);
    float angle=flow+(seed.x-.5)*2.6;
    vec3 comb=tangent*cos(angle)+bitangent*sin(angle);
    vec3 bend=cross(n,comb);
    float len=mix(1.05,3.25,seed.y);
    vec3 direction=n*(.30+.42*tip)+comb*(.85-.26*tip)+bend*(seed.x-.5)*1.8*tip;
    p+=.065*n+len*tip*direction;
    vec3 screenDir=view*(direction+.06*comb);
    vec2 widthDir=normalize(vec2(-screenDir.y,screenDir.x)+vec2(.0001,0));
    p+=transpose(view)*vec3(widthDir*across*(.115+.18*seed.y)*(1.-.94*tip),0);
    shadingNormal=normalize(shadingNormal+.19*comb);
    variation=seed.x;
  }
  vec3 projected=view*(p-pivot);
  lightCoord = .5 + .5 * lightProjection(projected, radius);
  P=position;
  N=view*shadingNormal;
  V=normal;
  gl_Position=vec4(projected.x,-projected.y,-projected.z, radius)/radius;
}`;

export const coatFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D pile;
uniform highp sampler2D lightDepth;
uniform float radius;
${backlightProjection}
uniform vec3 color;
uniform int pass, technique;
uniform float shell;
in vec3 P,N,V,lightCoord;
in float tip, variation, across;
out vec4 result;

float fiberMap(vec3 p, vec3 n){
  vec3 w=pow(abs(n),vec3(5.));
  w/=max(.001,w.x+w.y+w.z);
  return dot(w,vec3(texture(pile,p.zy/16.).r,texture(pile,p.xz/16.).r,texture(pile,p.xy/16.).r));
}
// Estimate transmission from the distance to the first surface seen by the lamp.
// Nearby depth taps soften the transition around folds and thin protrusions.
vec3 transmittedLight(vec3 n) {
  float edge = 1. - smoothstep(.08, .95, abs(n.z));
  float incidence = smoothstep(-.22, .68, dot(n.xy, backlight.xy));
  vec2 texel = 1. / vec2(textureSize(lightDepth, 0));
  vec3 distanceScale = mix(vec3(2.2), vec3(6.8), sqrt(color));
  vec3 transmission = vec3(0.);
  for (int i=0; i<4; i++) {
    vec2 corner = vec2(i%2, i/2) - .5;
    float entry = texture(lightDepth, lightCoord.xy + corner * texel).r;
    float thickness = max(0., (lightCoord.z-entry) * 2. * radius);
    transmission += exp2(-thickness/distanceScale);
  }
  // The dyed pile supplies the hue, and light scattered between fibers
  // carries a little of the lamp color through even a strongly saturated coat.
  vec3 tint = mix(sqrt(color), vec3(1.,.93,.80), .42);
  return .25 * transmission * tint * edge * incidence;
}

void main(){
  vec3 n=normalize(N);
  vec3 light=normalize(vec3(-.52,-.83,.62));
  float diffuse=dot(n,light);
  float wrap=clamp((diffuse+.65)/1.65,0.,1.);
  float rim=pow(1.-clamp(n.z,0.,1.),2.5);
  float facingLight=clamp(.58+.56*diffuse,0.,1.);
  // Soft frontal fill keeps the shaded pile chromatic, with a cooler underside.
  vec3 base = color * mix(vec3(.52,.55,.61), vec3(1.08,1.07,1.04), wrap);
  base=mix(base,vec3(1.,.97,.88),.16*pow(wrap,2.8));
  // A broad overhead bounce picks out the crown and separates the pile at the rim.
  base=mix(base,vec3(.99,.96,.88),.20*pow(max(0.,-n.y),3.));
  float fiber=fiberMap(P,normalize(V));
  if(pass==1){
    // A single density field across all shells gives each lock roots and thinning tips.
    float density=fiberMap(P-vec3(shell*.43,shell*.56,0),normalize(V));
    if(density<.20+.68*shell)discard;
    base*=.92+.12*shell;
    base+=vec3(.075,.071,.055)*shell*facingLight;
  }else if(pass==2){
    base*=.81+.15*variation+.16*tip;
    base+=vec3(1.,.96,.84)*(.035+.093*tip)*facingLight*(1.-.48*abs(across));
  }else if(technique==0){
    // Velvet: broad grazing sheen and a quiet nap on the diffuse base.
    base+=(fiber-.49)*.016;
    base+=vec3(1.,.94,.85)*rim*(.075+.18*facingLight);
  }else{
    base*=.95+.075*fiber;
  }
  float pileLift = pass==2 ? .18*tip : (pass==1 ? .12*shell : 0.);
  vec3 scatter = transmittedLight(n) * (.94 + pileLift);
  // Screen blend preserves highlight headroom on bright and pale coats.
  result=vec4(base + (1. - clamp(base,0.,1.)) * (1. - exp(-1.8*scatter)),1.);
}`;
