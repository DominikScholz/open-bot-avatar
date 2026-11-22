// Surface nets on the union of the avatar parts. One vertex per boundary cell
// gives the coat a closed surface, including the backs of ears and the walls of holes.
import { edgeDistance, type Volume } from '../volume.ts';
import { isInside } from '../path.ts';

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
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices),roots:new Float32Array(roots)};
}
