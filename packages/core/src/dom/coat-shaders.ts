// Coordinates stay on the avatar's front surface, so the recess turns with the head.
const socketField = `
uniform highp sampler2D eyeField;
uniform vec4 eyeRegion[2]; // face-plane center, square span, maximum host depth
uniform vec2 eyeSize[2];
float socketDistance(vec3 p, vec3 normal, out vec2 uv, out vec2 local) {
  uv = local = vec2(0.);
  if (normal.z < .03 || p.z < -.05) return 3.8;
  for (int i=0; i<2; i++) {
    vec4 e = eyeRegion[i];
    vec2 delta = p.xy - e.xy;
    if (e.z > 0. && p.z <= e.w && max(abs(delta.x),abs(delta.y)) < e.z*.49) {
      vec2 coords = delta/e.z;
      vec2 sampleUV = (coords + .5 + vec2(float(i),0.)) * vec2(.5,1.);
      float d = (textureLod(eyeField,sampleUV,0.).r - .5)*7.6;
      if (d >= 3.77) continue;
      uv = sampleUV;
      local = 2.*delta/max(eyeSize[i],vec2(.01));
      return d;
    }
  }
  return 3.8;
}`;

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
out vec3 P, N, V;
${socketField}
out float tip, variation, across;

void main(){
  vec3 n=normalize(normal), p=position;
  vec3 rounded=(position-pivot)/extent;
  // Broadly bend the lighting normals across flat front faces of inflated paths.
  vec3 shadingNormal=normalize(n + .78*rounded);
  vec2 uv, local;
  float d=socketDistance(position,n,uv,local);
  float wall=1.-smoothstep(-.35,2.30,d);
  // Compress the pile and lower the host surface. The rounded bead rises
  // slightly from the socket floor while its edge remains buried.
  p.z -= min(1.55,max(0.,position.z)*.40) * (wall - .40*smoothstep(0.,2.4,-d));
  float loft=mix(.14,1.,smoothstep(.0,3.1,d));
  tip=0.; variation=.5; across=0.;
  if(pass==1){
    p+=n*shell*1.55*loft;
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
    if (d < 3.5) {
      vec2 radial = normalize(local*vec2(1.7,1.)+vec2(.001));
      vec2 alongEdge = vec2(-radial.y,radial.x);
      comb.xy = mix(comb.xy, alongEdge * (dot(comb.xy,alongEdge)<0.?-1.:1.), .65*wall);
    }
    vec3 bend=cross(n,comb);
    float len=mix(1.05,3.25,seed.y)*loft;
    vec3 direction=n*(.30+.42*tip)+comb*(.85-.26*tip)+bend*(seed.x-.5)*1.8*tip;
    p+=.065*n+len*tip*direction;
    vec3 screenDir=view*(direction+.06*comb);
    vec2 widthDir=normalize(vec2(-screenDir.y,screenDir.x)+vec2(.0001,0));
    p+=transpose(view)*vec3(widthDir*across*(.115+.18*seed.y)*(1.-.94*tip),0);
    shadingNormal=normalize(shadingNormal+.19*comb);
    variation=seed.x;
  }
  vec3 projected=view*(p-pivot);
  // Evaluate strand coverage at the tapered tip as well as at its root.
  P=pass==2 ? vec3(p.xy,position.z) : position;
  N=view*shadingNormal;
  V=normal;
  gl_Position=vec4(projected.x,-projected.y,-projected.z, radius)/radius;
}`;

export const coatFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D pile;
uniform vec3 color, ink;
uniform mat3 view;
${socketField}
uniform int pass, technique;
uniform float shell;
in vec3 P,N,V;
in float tip, variation, across;
out vec4 result;

float fiberMap(vec3 p, vec3 n){
  vec3 w=pow(abs(n),vec3(5.));
  w/=max(.001,w.x+w.y+w.z);
  return dot(w,vec3(texture(pile,p.zy/16.).r,texture(pile,p.xz/16.).r,texture(pile,p.xy/16.).r));
}
void main(){
  vec3 n=normalize(N);
  vec3 light=normalize(vec3(-.52,-.83,.62));
  float diffuse=dot(n,light);
  float wrap=clamp((diffuse+.65)/1.65,0.,1.);
  float facingLight=clamp(.66+.34*diffuse,0.,1.);
  // Broad fill lets the dyed fiber color do most of the work.
  vec3 base=mix(color*(.88+.13*wrap),vec3(.98,.97,.94),.025*wrap*wrap);
  vec2 uv, local;
  float d=socketDistance(P,normalize(V),uv,local);
  if(pass==1 && d<.1) discard;
  if(pass==2 && d<-.1-.22*variation) discard;
  if(pass==1){
    // A single density field across all shells gives each lock roots and thinning tips.
    float density=fiberMap(P-vec3(shell*.43,shell*.56,0),normalize(V));
    if(density<.20+.68*shell)discard;
    base*=.92+.12*shell;
    base+=vec3(.041,.039,.034)*shell*facingLight;
  }else if(pass==2){
    base*=.86+.12*variation+.095*tip;
    base+=vec3(1.,.96,.84)*(.013+.069*tip)*facingLight*(1.-.48*abs(across));
  }else if(technique==0){
    // Velvet: broad grazing sheen and a quiet nap on the diffuse base.
    base+=(fiberMap(P,normalize(V))-.49)*.016;
  }else{
    base*=.95+.075*fiberMap(P,normalize(V));
  }
  // A soft light behind the right shoulder grazes the pile. Weighting by
  // view angle confines it to the silhouette as the avatar turns.
  float grazing = 1. - smoothstep(.09,.83,abs(n.z));
  float backlit = smoothstep(-.20,.79,dot(n.xy,vec2(.66,-.75)));
  vec3 rimTint = mix(sqrt(color),vec3(1.,.96,.89),.48);
  base += (1.-clamp(base,0.,1.))*rimTint*(.58*grazing*backlit);
  if(d < 3.7) {
    vec2 texel=1./vec2(textureSize(eyeField,0));
    vec2 g=vec2(texture(eyeField,uv+vec2(texel.x,0)).r-texture(eyeField,uv-vec2(texel.x,0)).r,
                texture(eyeField,uv+vec2(0,texel.y)).r-texture(eyeField,uv-vec2(0,texel.y)).r);
    vec2 outward=g/max(length(g),.001);
    float upper=dot(outward,normalize(vec2(-.38,-.92)));
    float crease=1.-smoothstep(-.1,1.85,d);
    // Recessed fibers receive diffuse bounce from the surrounding dyed pile.
    vec3 recessed = base*.53 + color*.18;
    base=mix(base,recessed,crease*(.69+.28*upper));
    base += color*.035*max(-upper,0.)*exp(-1.5*abs(d-1.5));
    if(pass==0) {
      vec2 curve=local*vec2(.86,.87);
      vec3 dome=normalize(vec3(curve,sqrt(max(.035,1.-dot(curve,curve)))));
      vec3 beadNormal=normalize(view*(dome+vec3(.22*outward,0.)*exp(-abs(d)/.75)));
      vec2 softbox=(beadNormal.xy-vec2(.23,-.53))/vec2(.39,.34);
      float reflection=exp(-dot(softbox,softbox));
      float coatBounce=.022+.075*pow(1.-clamp(beadNormal.z,0.,1.),1.4)+.018*max(beadNormal.y,0.);
      vec3 bead=ink*(.50+.32*beadNormal.z)+color*coatBounce+vec3(.21,.215,.22)*reflection;
      float aa=max(.05,fwidth(d));
      base=mix(bead,base,smoothstep(-aa*.5,aa*.5,d));
    }
  }
  result = vec4(base,1.);
}`;
