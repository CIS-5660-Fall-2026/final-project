import type { Point } from './types.ts';
import { key } from './grid.ts';
// Bridson (2007), 2D: spatial grid, active list, up to 30 annulus candidates.
export function poisson(width:number,height:number,radius:number,rng:()=>number,cap=16000):Point[] {
  const cell=radius/Math.SQRT2, cols=Math.ceil(width/cell), rows=Math.ceil(height/cell);
  const grid=new Int32Array(cols*rows).fill(-1), points:Point[]=[], active:number[]=[];
  function insert(p:Point) {grid[Math.floor(p.y/cell)*cols+Math.floor(p.x/cell)]=points.length;active.push(points.length);points.push(p);}
  insert({x:rng()*width,y:rng()*height});
  while(active.length&&points.length<cap) {
    const slot=Math.floor(rng()*active.length), p=points[active[slot]];let found=false;
    for(let k=0;k<30;k++){
      const a=rng()*Math.PI*2, r=radius*Math.sqrt(1+3*rng()), q={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};
      if(q.x<0||q.y<0||q.x>=width||q.y>=height)continue;
      const cx=Math.floor(q.x/cell),cy=Math.floor(q.y/cell);let valid=true;
      for(let y=Math.max(0,cy-2);y<=Math.min(rows-1,cy+2)&&valid;y++) for(let x=Math.max(0,cx-2);x<=Math.min(cols-1,cx+2);x++){
        const index=grid[y*cols+x];if(index>=0&&Math.hypot(q.x-points[index].x,q.y-points[index].y)<radius){valid=false;break;}
      }
      if(valid){insert(q);found=true;break;}
    }
    if(!found){active[slot]=active.at(-1)!;active.pop();}
  }
  return points;
}
export function hatchCenters(floor:Point[],density:number,rng:()=>number):Point[] {
  if(density<=0||!floor.length)return [];
  const cells=new Set(floor.map(key));
  const minX=Math.min(...floor.map(p=>p.x))-2,minY=Math.min(...floor.map(p=>p.y))-2;
  const width=Math.max(...floor.map(p=>p.x))-minX+3,height=Math.max(...floor.map(p=>p.y))-minY+3;
  return poisson(width,height,1.45-density*0.8,rng).map(p=>({x:p.x+minX,y:p.y+minY})).filter(p=>{
    if(cells.has(key({x:Math.floor(p.x),y:Math.floor(p.y)})))return false;
    for(let y=Math.floor(p.y)-2;y<=Math.floor(p.y)+2;y++)for(let x=Math.floor(p.x)-2;x<=Math.floor(p.x)+2;x++){
      if(cells.has(key({x,y}))&&Math.hypot(Math.max(x-p.x,0,p.x-x-1),Math.max(y-p.y,0,p.y-y-1))<1.15)return true;
    }
    return false;
  });
}
