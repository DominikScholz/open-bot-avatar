// Coordinates stay on the avatar's front surface, so the recess turns with the head.
const socketField = `
uniform highp sampler2D eyeField;
uniform vec4 eyeRegion[2]; // face-plane center, square span, maximum host depth
uniform vec2 eyeSize[2];
float socketDistance(vec3 p, vec3 normal, out vec2 uv, out vec3 local) {
  uv=vec2(0.); local=vec3(0.);
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
      local.xy = 2.*delta/max(eyeSize[i],vec2(.01));
      // As lids close, the pressed lip narrows with the expression.
      local.z = smoothstep(.35,1.5,eyeSize[i].y/max(.01,eyeSize[i].x));
      return d*mix(1.5,1.,local.z);
    }
  }
  return 3.8;
}`;

// Keep the crown and the shell lean in the same coordinates as the baked groom.
const groom = `
uniform bool brushed;
uniform vec3 pivot, extent;
vec3 fromCrown(vec3 p) {
  return p - (pivot + vec3(-.08*extent.x, -.28*extent.y, 0.));
}`;

export const coatVertex = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 seed;
uniform mat3 view;
${groom}
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
  vec2 uv; vec3 local;
  float d=socketDistance(position,n,uv,local);
  float wall=1.-smoothstep(-.35,2.30,d);
  // Compress the pile and lower the host surface. The rounded bead rises
  // slightly from the socket floor while its edge remains buried.
  float seat=min(1.55,max(0.,position.z)*.40);
  p.z -= seat * (wall - .40*smoothstep(0.,2.4,-d));
  float loft=mix(.14,1.,smoothstep(.0,3.1,d));
  tip=0.; variation=.5; across=0.;
  if(pass==1){
    p+=n*shell*(brushed ? 1.10 : 1.55)*loft;
    if (brushed) {
      vec3 radial=fromCrown(position);
      vec3 along=radial-n*dot(radial,n);
      p+=along*inversesqrt(dot(along,along)+3.)*(1.05*shell*loft);
    } else {
      p.y+=shell*shell*.42;
    }
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
    float crownSpread=1.;
    if (brushed) {
      vec3 radial=fromCrown(position);
      vec3 along=radial-n*dot(radial,n);
      // Lift the nap near the crown; farther out neighboring tips sweep
      // together, with a little local curl and seed-dependent splay.
      vec3 groomDir=along*inversesqrt(dot(along,along)+30.);
      crownSpread=smoothstep(0.,8.,length(along));
      vec3 splay=tangent*cos(6.283*seed.x)+bitangent*sin(6.283*seed.x);
      comb=normalize(groomDir+mix(.92*splay,.28*comb,crownSpread)+vec3(.0001));
    }
    if (d < 3.5) {
      vec2 radial = normalize(local.xy*vec2(1.7,1.)+vec2(.001));
      vec2 alongEdge = vec2(-radial.y,radial.x);
      comb.xy = mix(comb.xy, alongEdge * (dot(comb.xy,alongEdge)<0.?-1.:1.), .65*wall);
    }
    vec3 bend=cross(n,comb);
    float len=mix(1.05,3.25,seed.y)*loft;
    vec3 direction=n*(.30+.42*tip)+comb*(.85-.26*tip)+bend*(seed.x-.5)*1.8*tip;
    float width=.115+.18*seed.y;
    if (brushed) {
      len=mix(1.6,3.8,seed.y)*loft*mix(.62,1.,crownSpread);
      direction=n*(.30+.18*tip)+comb*(.93-.12*tip)+bend*(seed.x-.5)*.45*tip;
      p+=n*.52*loft;
      width=.073+.11*seed.y;
    }
    p+=.065*n+len*tip*direction;
    vec3 screenDir=view*(direction+.06*comb);
    vec2 widthDir=normalize(vec2(-screenDir.y,screenDir.x)+vec2(.0001,0));
    p+=transpose(view)*vec3(widthDir*across*width*(1.-.94*tip),0);
    shadingNormal=normalize(shadingNormal+.19*comb);
    variation=seed.x;
  }
  vec3 projected=view*(p-pivot);
  // Evaluate strand coverage at the tapered tip as well as at its root.
  P=position;
  if(pass==2){
    P.xy=p.xy;
    // Clip the tips at the visible mouth of the socket. An elevated strand
    // otherwise projects across the bead long before it reaches its rim.
    if(view[2].z>.22){
      vec2 slant=vec2(view[0].z,view[1].z)/view[2].z;
      P.xy-=slant*max(0.,p.z-position.z+seat);
    }
  }
  N=view*shadingNormal;
  V=normal;
  gl_Position=vec4(projected.x,-projected.y,-projected.z, radius)/radius;
}`;

export const coatFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D pile, brushedPile;
${groom}
uniform vec3 color, ink;
uniform mat3 view;
${socketField}
uniform int pass;
uniform bool previousLighting;
uniform float shell;
in vec3 P,N,V;
in float tip, variation, across;
out vec4 result;

float fiberMap(vec3 p, vec3 n){
  vec3 w=pow(abs(n),vec3(5.));
  w/=max(.001,w.x+w.y+w.z);
  return dot(w,vec3(texture(pile,p.zy/16.).r,texture(pile,p.xz/16.).r,texture(pile,p.xy/16.).r));
}
float brushedHeight(vec3 p, vec3 n){
  vec3 uvw=fromCrown(p)/(2.8*max(extent.x,max(extent.y,extent.z)))+.5;
  vec3 w=pow(abs(n),vec3(6.));
  w/=max(.001,w.x+w.y+w.z);
  return dot(w,vec3(texture(brushedPile,uvw.zy).r,texture(brushedPile,uvw.xz).r,
                    texture(brushedPile,uvw.xy).r));
}
// Scale the dye's value for recesses and fiber texture. At the bright end
// sRGB runs out of headroom in the strongest channel. Lift the other dyed
// channels most where they already carry color, with a small surface glint.
vec3 litPile(float diffuseLevel, float fiberLight){
  float value=max(color.r,max(color.g,color.b));
  vec3 dye=value>0. ? color/value : vec3(1.);
  float weakest=min(dye.r,min(dye.g,dye.b));
  // The weakest channel controls saturation. Its glint can lift at most
  // nine percent of the distance to white, regardless of the chosen swatch.
  vec3 scatter=(1.-dye)*(.09+.91*(dye-weakest))*clamp(1.85*fiberLight,0.,1.);
  float brightness=clamp(value*diffuseLevel+(.35+.65*value)*fiberLight,0.,1.);
  return (dye+scatter)*brightness;
}
void main(){
  vec3 n=normalize(N);
  vec3 light=normalize(vec3(-.52,-.83,.62));
  float diffuse=dot(n,light);
  float wrap=clamp((diffuse+.65)/1.65,0.,1.);
  float facingLight=clamp(.66+.34*diffuse,0.,1.);
  float diffuseLevel=(previousLighting ? .88 : .87)+.13*wrap;
  float sheen=.014*wrap*wrap;
  float rimExposure=1.;
  vec2 uv; vec3 local;
  float d=socketDistance(P,normalize(V),uv,local);
  if(pass==1 && d<.1) discard;
  if(pass==2 && d<.10-.08*variation) discard;
  float pileFill=1.;
  float height=0.;
  if(brushed){
    height=brushedHeight(P,normalize(V));
    // A little variation in the density of the whole lock survives bright
    // rim lighting, even when the strongest dye channel reaches full value.
    pileFill=.925+.075*smoothstep(.22,.81,height);
  }
  if(brushed && pass==2){
    // MSAA can evaluate a subpixel ribbon outside its edges at the pixel center.
    float edge=min(1.,abs(across));
    float glint=smoothstep(.08,.82,tip)*(1.-.32*edge*edge);
    diffuseLevel*=.935+.11*variation+.035*clamp(tip,0.,1.);
    sheen+=(.012+.20*glint)*(.44+.56*variation)*facingLight;
  }else if(brushed){
    float layer=pass==1 ? shell : 0.;
    if(pass==1 && height<.21+.59*layer) discard;
    // The solid backing is dyed as brightly as the roots. Relief is mostly
    // from the softly lit crests of neighboring locks.
    diffuseLevel*=.895+.16*height+.035*layer;
    sheen+=(.012+.13*smoothstep(.41,.86,height)+.022*layer)*facingLight;
    rimExposure=.80+.34*layer;
  }else if(pass==1){
    // A single density field across all shells gives each lock roots and thinning tips.
    float density=fiberMap(P-vec3(shell*.43,shell*.56,0),normalize(V));
    if(density<.20+.68*shell)discard;
    diffuseLevel*=.92+.12*shell;
    sheen+=.041*shell*facingLight;
    rimExposure=.72+.50*shell;
  }else if(pass==2){
    diffuseLevel*=previousLighting ? .86+.12*variation+.095*tip : .80+.14*variation+.20*tip;
    sheen+=(.013+.069*tip)*facingLight*(1.-.48*abs(across));
    rimExposure=.67+.38*variation+.50*tip;
  }else{
    diffuseLevel*=.95+.075*fiberMap(P,normalize(V));
  }
  // A soft light behind the right shoulder grazes the pile. Weighting by
  // view angle confines it to the silhouette as the avatar turns.
  float grazing = 1. - smoothstep(.09,.83,abs(n.z));
  float backlit = smoothstep(-.20,.79,dot(n.xy,vec2(.66,-.75)));
  float upper=0., crease=0., pileRelief=0., contact=0., lipLight=0.;
  if(d < 3.7) {
    vec2 texel=1./vec2(textureSize(eyeField,0));
    vec2 g=vec2(texture(eyeField,uv+vec2(texel.x,0)).r-texture(eyeField,uv-vec2(texel.x,0)).r,
                texture(eyeField,uv+vec2(0,texel.y)).r-texture(eyeField,uv-vec2(0,texel.y)).r);
    vec2 outward=g/max(length(g),.001);
    upper=dot(outward,normalize(vec2(.96,-.28)));
    float fibers=fiberMap(P,normalize(V));
    crease=1.-smoothstep(-.12,1.65+1.30*upper+.6*(fibers-.5),d);
    if (pass==2) {
      // The rolled lip reveals brighter tips above a darker, compressed undercoat.
      pileRelief=((tip-.46)*.16+(fibers-.48)*.11)*(1.-smoothstep(1.5,3.65,d));
    }
    contact=1.-smoothstep(-.04,.38,d);
    float lip = smoothstep(.03,.49,d)*(1.-smoothstep(1.10,3.65,d));
    float gathered=clamp(.22-.52*outward.x+1.14*outward.y,0.,1.22);
    float tipLight=previousLighting ? .16+.25*fibers : .14+.22*fibers;
    lipLight=tipLight*gathered*lip*mix(.40,1.,local.z);
  }
  float occlusion=crease*(.76+.18*upper);
  vec3 base;
  if (previousLighting) {
    vec3 dye=color*diffuseLevel;
    vec3 rimTint=mix(sqrt(color),vec3(1.,.96,.89),.48);
    vec3 reflected=mix(color,vec3(1.,.97,.91),.48)*sheen;
    reflected+=(1.-clamp(dye,0.,1.))*rimTint*(.58*grazing*backlit);
    base=dye*(1.-.54*occlusion)+reflected*(1.-crease)+color*pileRelief;
    base*=1.-(.51+.04*upper)*contact;
    base+=mix(color,vec3(1.),.10)*lipLight;
  } else {
    float fiberLight=sheen+.46*grazing*backlit*rimExposure;
    diffuseLevel=(diffuseLevel*(1.-.48*occlusion)+pileRelief)*(1.-(.36+.04*upper)*contact);
    base=litPile(diffuseLevel,fiberLight*(1.-crease)+lipLight);
  }
  base*=pileFill;
  if(pass==0 && d<3.7) {
    vec2 curve=local.xy*.94;
    vec3 dome=normalize(vec3(curve,sqrt(max(.02,1.-dot(curve,curve)))));
    vec3 beadNormal=normalize(view*dome);
    // The high strip reflects mostly the light source. The softer side fill
    // picks up more of the nearby coat as the bead turns.
    vec2 key=beadNormal.xy-vec2(.59,-.865);
    key=vec2(key.x-.76*key.y,key.y)/vec2(.55,.70);
    vec2 fill=beadNormal.xy-vec2(.61,-.195);
    fill=vec2(fill.x-.37*fill.y,fill.y)/vec2(.47,1.01);
    float stripLight=(previousLighting ? .40 : .38)*exp(-dot(key,key));
    float sideLight=.13*exp(-dot(fill,fill));
    float coatBounce=.003+.018*pow(1.-clamp(beadNormal.z,0.,1.),1.6);
    float inkValue=max(ink.r,max(ink.g,ink.b));
    vec3 bead=ink*sqrt(inkValue)*(.40+.24*beadNormal.z+.24*inkValue)+color*coatBounce;
    vec3 reflection=previousLighting ? vec3(1.,.99,.98)*(stripLight+sideLight)
      : mix(vec3(1.),color,.28)*stripLight+mix(vec3(1.),color,.72)*sideLight;
    bead+=reflection*smoothstep(-.12,.55,-d);
    float aa=max(.15,fwidth(d));
    base=mix(bead,base,smoothstep(-aa*.5,aa*.5,d));
  }
  result = vec4(base,1.);
}`;
