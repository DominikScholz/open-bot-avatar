// Surface nets on the union of the avatar parts. One vertex per boundary cell
// gives the coat a closed surface, including the backs of ears and the walls of holes.
import { edgeDistance, type Volume } from '../volume.ts';
import { isInside } from '../path.ts';
import { EYE_H, EYE_W, GAZE_X, GAZE_Y, HAPPY_ARC } from '../validate.ts';
import { SOCKET_PAD } from './eye.ts';

export interface CoatMesh {
  vertices: Float32Array; // position and outward normal
  indices: Uint32Array;
  roots: Float32Array; // independent, area-weighted samples for instancing
}

export function coatMesh(vol: Volume): CoatMesh {
  const step = 1.05, pad = 3 * step;
  const b = vol.bounds;
  const half = Math.max(0.5,...vol.parts.map(p => p.depth/2));
  const x0 = b.minX-pad, y0 = b.minY-pad, z0 = -half-pad;
  const nx = Math.ceil((b.maxX-b.minX+2*pad)/step)+1;
  const ny = Math.ceil((b.maxY-b.minY+2*pad)/step)+1;
  const nz = Math.ceil((2*half+2*pad)/step)+1;
  const plane = nx*ny;
  const field = new Float32Array(plane*nz).fill(-1000);
  for (const part of vol.parts) {
    for (let j=0;j<ny;j++) for (let i=0;i<nx;i++) {
      const x=x0+i*step, y=y0+j*step;
      const sd=edgeDistance(part.polys,x,y)*(isInside(part.polys,x,y)?1:-1);
      const h=part.kind==='inflate'?0:part.height(x,y);
      for(let k=0;k<nz;k++) {
        const z=Math.abs(z0+k*step);
        let d;
        if(part.kind==='inflate' && part.rxy>0 && part.rz>0) {
          const side=(part.rxy-sd)/part.rxy, top=(z-part.depth/2+part.rz)/part.rz;
          d=(1-Math.hypot(Math.max(0,side),Math.max(0,top)))*Math.min(part.rxy,part.rz);
        } else d=Math.min(sd,Math.max(.55,h)-z);
        const at=i+j*nx+k*plane;
        if(d>field[at]) field[at]=d;
      }
    }
  }
  const corners=[0,1,nx,nx+1,plane,plane+1,plane+nx,plane+nx+1];
  const strides=[1,nx,plane];
  const ids=new Int32Array(field.length).fill(-1);
  const vertices:number[]=[], indices:number[]=[];
  for(let k=1;k<nz-2;k++) for(let j=1;j<ny-2;j++) for(let i=1;i<nx-2;i++) {
    const cell=i+j*nx+k*plane, inside=field[cell]>0;
    if(corners.every(n=>(field[cell+n]>0)===inside)) continue;
    let sx=0,sy=0,sz=0,count=0,gx=0,gy=0,gz=0;
    for(let c=0;c<8;c++) {
      const a=cell+corners[c];
      for(let axis=0;axis<3;axis++) {
        if(c & (1<<axis)) continue;
        const other=a+strides[axis];
        if((field[a]>0)===(field[other]>0))continue;
        const t=field[a]/(field[a]-field[other]);
        sx+=(c&1)+(axis===0?t:0);
        sy+=((c>>1)&1)+(axis===1?t:0);
        sz+=((c>>2)&1)+(axis===2?t:0);
        // Interpolate the gradients at the ends of the crossing edge.
        const grad=(s:number)=>(field[a-s]-field[a+s])*(1-t)+(field[other-s]-field[other+s])*t;
        gx+=grad(1); gy+=grad(nx); gz+=grad(plane); count++;
      }
    }
    const norm=Math.hypot(gx,gy,gz)||1;
    const id=vertices.length/6;
    ids[cell]=id;
    vertices.push(x0+(i+sx/count)*step,y0+(j+sy/count)*step,z0+(k+sz/count)*step,gx/norm,gy/norm,gz/norm);
    for(let axis=0;axis<3;axis++) {
      if((field[cell+strides[axis]]>0)===inside)continue;
      const u=strides[(axis+1)%3],v=strides[(axis+2)%3];
      const p=ids[cell-u],q=ids[cell-u-v],r=ids[cell-v];
      if(Math.min(p,q,r)>=0) indices.push(id,p,q,id,q,r);
    }
  }
  let seed=51821;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const roots:number[]=[];
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*6,b=indices[i+1]*6,c=indices[i+2]*6;
    const ab=[0,1,2].map(k=>vertices[b+k]-vertices[a+k]);
    const ac=[0,1,2].map(k=>vertices[c+k]-vertices[a+k]);
    const area=.5*Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
    const hairs=Math.floor(area*3.3+random());
    for(let h=0;h<hairs;h++){
      const u=Math.sqrt(random()),v=u*random();
      for(let k=0;k<6;k++) roots.push((1-u)*vertices[a+k]+(u-v)*vertices[b+k]+v*vertices[c+k]);
      roots.push(random(),random());
    }
  }
  // The body grid is too coarse to describe a bead in profile. Refine only
  // the front triangles within reach of a socket, after sampling hair roots.
  const padEye = SOCKET_PAD + 2 * step;
  const reachX = vol.eyeScale * (EYE_W * (HAPPY_ARC.halfWidth + HAPPY_ARC.stroke / 2) + GAZE_X) + padEye;
  const reachY = vol.eyeScale * (EYE_H / 2 + GAZE_Y) + padEye;
  const refined: number[] = [];
  const midpoints = new Map<string, number>();
  function midpoint(a: number, b: number) {
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    const cached = midpoints.get(key);
    if (cached !== undefined) return cached;
    const id = vertices.length / 6;
    for (let k = 0; k < 6; k++) vertices.push((vertices[6 * a + k] + vertices[6 * b + k]) / 2);
    midpoints.set(key, id);
    return id;
  }
  function refine(a: number, b: number, c: number, level: number) {
    if (level === 0) {
      refined.push(a, b, c);
      return;
    }
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    refine(a, ab, ca, level - 1);
    refine(ab, b, bc, level - 1);
    refine(ca, bc, c, level - 1);
    refine(ab, bc, ca, level - 1);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const x = vertices[6 * a], y = vertices[6 * a + 1], z = vertices[6 * a + 2];
    if (z >= -2 * step && vol.eyePlanes.some(eye => Math.abs(eye.x - x) <= reachX && Math.abs(eye.y - y) <= reachY)) {
      refine(a, b, c, 2);
    } else refined.push(a, b, c);
  }
  return {
    vertices: new Float32Array(vertices), indices: new Uint32Array(refined), roots: new Float32Array(roots),
  };
}
