import { EYE_TILE, exposedHeight, SOCKET_PAD, eyeBox, eyeDistanceTile } from './eye.ts';
import type { FrameShape, ViewBasis } from '../render.ts';
import type { Volume } from '../volume.ts';
import { coatMesh } from './coat-mesh.ts';
import { coatVertex, coatFragment } from './coat-shaders.ts';

export type Coat = 'velvet' | 'shell' | 'fleece';
export type CoatLighting = 'current' | 'previous';

// Tileable strand-density texture. Shells sample different thresholds of the same locks.
function densityTile(): HTMLCanvasElement {
  const tile=document.createElement('canvas');
  tile.width=tile.height=128;
  const g=tile.getContext('2d')!;
  g.fillStyle='#252525'; g.fillRect(0,0,128,128); g.lineCap='round';
  let seed=9213;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<1400;i++){
    const x=random()*128,y=random()*128;
    const angle=2.4*Math.sin(y*Math.PI/32)+1.4*Math.cos(x*Math.PI/32)+(random()-.5)*3.3;
    const dx=Math.cos(angle),dy=Math.sin(angle),length=3+random()*8,curl=(random()-.5)*length;
    const grey=Math.round(55+200*random());
    g.strokeStyle='rgb('+grey+' '+grey+' '+grey+')'; g.lineWidth=.8+random()*1.5;
    for(const ox of [-128,0,128])for(const oy of [-128,0,128]){
      if(x+ox < -12 || x+ox>140 || y+oy < -12 || y+oy>140)continue;
      g.beginPath();g.moveTo(x+ox,y+oy);
      g.quadraticCurveTo(x+ox+dx*length*.5-dy*curl,y+oy+dy*length*.5+dx*curl,x+ox+dx*length,y+oy+dy*length);
      g.stroke();
    }
  }
  return tile;
}

function linkProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const program=gl.createProgram()!;
  for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
    const shader=gl.createShader(kind)!;
    gl.shaderSource(shader,source); gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)??'Coat shader compilation failed');
    gl.attachShader(program,shader); gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)??'Coat shader linking failed');
  return program;
}

function makePainter(){
  const canvas=document.createElement('canvas');
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
  if(!gl)return null;
  canvas.addEventListener('webglcontextlost', e => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { painter = undefined; });
  const program = linkProgram(gl, coatVertex, coatFragment);
  gl.useProgram(program);
  const loc=(name:string)=>gl.getUniformLocation(program,name);
  const u={view:loc('view'),pivot:loc('pivot'),extent:loc('extent'),radius:loc('radius'),shell:loc('shell'),pass:loc('pass'),technique:loc('technique'),color:loc('color')};
  gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,densityTile());
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, 2*EYE_TILE, EYE_TILE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(loc('eyeField'), 1);
  const regionUniform = loc('eyeRegion[0]'), inkUniform = loc('ink');
  const previousLightingUniform = loc('previousLighting');
  const sizeUniform = loc('eyeSize[0]'), eyeSizes = new Float32Array(4);
  const regions = new Float32Array(8), previousRegions = new Float32Array(8);
  const contours = ['', ''];
  const mask = document.createElement('canvas');
  mask.width = mask.height = EYE_TILE;
  const maskCtx = mask.getContext('2d', { willReadFrequently: true })!;
  const surface=gl.createVertexArray(),hairs=gl.createVertexArray();
  const surfaceBuffer=gl.createBuffer(),hairBuffer=gl.createBuffer(),elements=gl.createBuffer();
  for(const [vao,buffer,stride,divisor] of [[surface,surfaceBuffer,24,0],[hairs,hairBuffer,32,1]] as const){
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for(let i=0;i<(divisor?3:2);i++){
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i,i===2?2:3,gl.FLOAT,false,stride,i*12);
      gl.vertexAttribDivisor(i,divisor);
    }
    if(!divisor)gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);
  }
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  let previous:Volume|undefined,triangles=0,count=0,radius=0,cx=0,cy=0;
  let lastColor='', lastInk='';
  let lastPixels=0, lastView:ViewBasis|undefined, lastCoat:Coat|undefined;
  let lastLighting: CoatLighting | undefined;
  const swatch=document.createElement('canvas').getContext('2d',{willReadFrequently:true})!;
  return (vol:Volume,v:ViewBasis,color:string,coat:Coat,scale:number,ink:string,shapes:FrameShape[],lighting:CoatLighting='current')=>{
    if(gl.isContextLost())return null;
    const geometryChanged = previous !== vol;
    if(geometryChanged){
      const mesh=coatMesh(vol);
      gl.bindVertexArray(surface);gl.bindBuffer(gl.ARRAY_BUFFER,surfaceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,hairBuffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.roots,gl.STATIC_DRAW);
      const b=vol.bounds,rx=(b.maxX-b.minX)/2,ry=(b.maxY-b.minY)/2;
      const rz=Math.max(.5,...vol.parts.map(p=>p.depth/2));
      cx=b.minX+rx; cy=b.minY+ry; radius=Math.ceil(Math.hypot(rx,ry,rz)+4);
      gl.uniform3f(u.pivot,cx,cy,0); gl.uniform3f(u.extent,rx,ry,rz);
      gl.uniform1f(u.radius,radius);
      triangles=mesh.indices.length;count=mesh.roots.length/8;previous=vol;
    }
    regions.fill(0);
    let contourChanged = false;
    for (const shape of shapes) {
      if (shape.kind !== 'eye') continue;
      const slot = shape.key === 'eye-0' ? 0 : 1;
      const mark = shape.mark;
      const { x, y, w, h } = eyeBox(mark);
      const cx = x+w/2, cy = y+h/2, span = Math.max(w,h)+2*SOCKET_PAD;
      eyeSizes.set([w, h*exposedHeight(w,h)], 2*slot);
      regions.set([cx, cy, span, vol.eyeZ[slot]+.8], 4*slot);
      // Gaze translates the tile. Only a change of contour needs a new distance field.
      const key = mark.shape === 'pill' ? [w,h,mark.radius].join('|') : JSON.stringify(mark);
      if (key !== contours[slot]) {
        const tile = eyeDistanceTile(maskCtx, mark, cx, cy, span);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, slot*EYE_TILE, 0, EYE_TILE, EYE_TILE, gl.RED, gl.UNSIGNED_BYTE, tile);
        contours[slot] = key;
        contourChanged = true;
      }
    }
    const eyesChanged = contourChanged || regions.some((v,i) => v !== previousRegions[i]);
    if (eyesChanged) {
      gl.uniform4fv(regionUniform, regions);
      gl.uniform2fv(sizeUniform, eyeSizes);
      previousRegions.set(regions);
    }
    const pixels=Math.min(1024,Math.max(32,Math.ceil(2*radius*scale)));
    const result={canvas,radius,cx,cy};
    // Root motion is composited separately. Reuse the GPU image
    // until the change in surface projection reaches about a tenth of a pixel.
    const tolerance=.1/(radius*scale);
    if(!geometryChanged && !eyesChanged && ink===lastInk && color===lastColor && coat===lastCoat && lighting===lastLighting && pixels===lastPixels && lastView &&
       Math.abs(v.cY-lastView.cY)+Math.abs(v.sY-lastView.sY)+Math.abs(v.sP-lastView.sP)+Math.abs(v.cP-lastView.cP)<tolerance) return result;
    lastPixels=pixels; lastView=v; lastCoat=coat;
    if(canvas.width!==pixels || canvas.height!==pixels)canvas.width=canvas.height=pixels;
    const viewMatrix = [v.cY,v.sY*v.sP,-v.sY*v.cP, 0,v.cP,v.sP, v.sY,-v.cY*v.sP,v.facing];
    gl.viewport(0,0,pixels,pixels);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    if(color!==lastColor){
      swatch.fillStyle=color;swatch.fillRect(0,0,1,1);
      const rgba=swatch.getImageData(0,0,1,1).data;
      gl.uniform3f(u.color,rgba[0]/255,rgba[1]/255,rgba[2]/255);lastColor=color;
    }
    if (ink !== lastInk) {
      swatch.fillStyle=ink; swatch.fillRect(0,0,1,1);
      const rgba=swatch.getImageData(0,0,1,1).data;
      gl.uniform3f(inkUniform,rgba[0]/255,rgba[1]/255,rgba[2]/255);
      lastInk=ink;
    }
    gl.uniformMatrix3fv(u.view,false,viewMatrix);
    if (lighting !== lastLighting) {
      gl.uniform1i(previousLightingUniform, lighting === 'previous' ? 1 : 0);
      lastLighting = lighting;
    }
    gl.uniform1i(u.technique,coat==='velvet'?0:1);
    gl.uniform1i(u.pass,0); gl.bindVertexArray(surface);
    gl.drawElements(gl.TRIANGLES,triangles,gl.UNSIGNED_INT,0);
    if(coat==='shell'){
      gl.uniform1i(u.pass,1);
      for(let layer=1;layer<=9;layer++){
        gl.uniform1f(u.shell,layer/9);
        gl.drawElements(gl.TRIANGLES,triangles,gl.UNSIGNED_INT,0);
      }
    } else if(coat==='fleece'){
      gl.uniform1i(u.pass,2);gl.bindVertexArray(hairs);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,8,count);
    }
    return result;
  };
}

let painter: ReturnType<typeof makePainter> | undefined;
export function renderCoat(...args: Parameters<NonNullable<typeof painter>>){
  if (painter === undefined) {
    painter = null;
    try { painter = makePainter(); }
    catch (error) { console.warn('Surface materials are unavailable.', error); }
  }
  return painter?.(...args)??null;
}
