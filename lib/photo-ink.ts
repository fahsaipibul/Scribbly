export type InkPoint = { x: number; y: number };
export type InkStroke = { points: InkPoint[]; color: string; width: number };

// Thin the font mask into connected centerlines, then trace actual pen paths.
// This avoids the disconnected dot/scan-line rendering used by the early demo.
export function traceMask(input: Uint8Array, width: number, height: number): InkPoint[][] {
  const pixels = input.slice();
  const offsets = [-width, -width+1, 1, width+1, width, width-1, -1, -width-1];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass=0; pass<2; pass++) {
      const remove: number[] = [];
      for (let y=1;y<height-1;y++) for(let x=1;x<width-1;x++) {
        const i=y*width+x; if(!pixels[i]) continue;
        const p=offsets.map(d=>pixels[i+d]);
        const count=p.reduce((a,b)=>a+b,0);
        const transitions=p.filter((v,j)=>!v&&p[(j+1)%8]).length;
        if(count<2||count>6||transitions!==1) continue;
        if(pass===0 ? p[0]*p[2]*p[4]||p[2]*p[4]*p[6] : p[0]*p[2]*p[6]||p[0]*p[4]*p[6]) continue;
        remove.push(i);
      }
      for(const i of remove) pixels[i]=0;
      if(remove.length) changed=true;
    }
  }
  const neighbors=(i:number)=>offsets.map(d=>i+d).filter(j=>j>=0&&j<pixels.length&&pixels[j]&&Math.abs(j%width-i%width)<=1);
  const visited=new Set<string>(); const paths: InkPoint[][]=[];
  const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  const point=(i:number)=>({x:i%width,y:Math.floor(i/width)});
  function trace(start:number,next:number) {
    const path=[point(start)]; let previous=start,current=next;
    while(true) {
      visited.add(key(previous,current)); path.push(point(current));
      const ns=neighbors(current);
      if(ns.length!==2) break;
      const target=ns.find(n=>n!==previous)!;
      if(visited.has(key(current,target))) break;
      previous=current;current=target;
    }
    paths.push(path);
  }
  // Endpoints/junctions first; the second pass captures closed loops (o, e, etc.).
  for(let phase=0;phase<2;phase++) for(let i=0;i<pixels.length;i++) if(pixels[i]) {
    const ns=neighbors(i);
    if(phase===0&&ns.length===0) paths.push([point(i),point(i)]);
    if(phase===0&&ns.length===2) continue;
    for(const next of ns) if(!visited.has(key(i,next))) trace(i,next);
  }
  return paths;
}

export function handwritingInk(text: string, x: number, y: number): InkStroke[] {
  const scale=2, canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d', {willReadFrequently:true});
  if(!ctx) throw new Error('This browser cannot create ink.');
  ctx.font='500 22px ScribblyHand';
  canvas.width=Math.ceil(ctx.measureText(text).width+16)*scale;canvas.height=40*scale;
  ctx.scale(scale,scale);ctx.font='500 22px ScribblyHand';ctx.fillStyle='#000';ctx.textBaseline='alphabetic';
  ctx.fillText(text,4,25);
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const mask=new Uint8Array(canvas.width*canvas.height);
  for(let i=0;i<mask.length;i++) mask[i]=rgba[i*4+3]>90?1:0;
  return traceMask(mask,canvas.width,canvas.height).map(points=>({
    points:points.map(p=>({x:x+p.x/scale-4,y:y+p.y/scale-5})),color:'#24322f',width:1.4,
  }));
}

// Clip each segment against the circular eraser, preserving both surviving ends.
export function eraseInk(strokes: InkStroke[], center: InkPoint, radius=4): InkStroke[] {
  return strokes.flatMap(stroke=>{
    const r=radius+stroke.width/2, result: InkStroke[]=[];
    let run: InkPoint[]=[]; const flush=()=>{if(run.length)result.push({...stroke,points:run});run=[];};
    if(stroke.points.length===1) return Math.hypot(stroke.points[0].x-center.x,stroke.points[0].y-center.y)>r?[stroke]:[];
    for(let i=1;i<stroke.points.length;i++) {
      const a=stroke.points[i-1],b=stroke.points[i],dx=b.x-a.x,dy=b.y-a.y;
      const A=dx*dx+dy*dy,B=2*((a.x-center.x)*dx+(a.y-center.y)*dy),C=(a.x-center.x)**2+(a.y-center.y)**2-r*r;
      const D=B*B-4*A*C;
      const cuts=[0,1];
      if(A&&D>0) for(const t of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)]) if(t>0&&t<1) cuts.push(t);
      cuts.sort((a,b)=>a-b);
      for(let j=1;j<cuts.length;j++) {
        const lo=cuts[j-1],hi=cuts[j],mid=(lo+hi)/2;
        if(Math.hypot(a.x+dx*mid-center.x,a.y+dy*mid-center.y)<r-1e-8) {flush();continue;}
        const first={x:a.x+dx*lo,y:a.y+dy*lo},last={x:a.x+dx*hi,y:a.y+dy*hi};
        if(!run.length)run.push(first);run.push(last);
      }
    }
    flush();return result;
  });
}
