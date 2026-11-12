import type { Point } from './types.ts';
import { key } from './grid.ts';
export interface Segment { a:Point; b:Point }
export function boundarySegments(floor:Point[]):Segment[] {
  const cells=new Set(floor.map(key));
  const rows=new Map<string,number[]>();
  const add=(axis:string,line:number,start:number)=>{const k=axis+':'+line; if(!rows.has(k))rows.set(k,[]);rows.get(k)!.push(start);};
  for(const p of floor) {
    if(!cells.has(key({x:p.x,y:p.y-1})))add('h',p.y,p.x);
    if(!cells.has(key({x:p.x,y:p.y+1})))add('h',p.y+1,p.x);
    if(!cells.has(key({x:p.x-1,y:p.y})))add('v',p.x,p.y);
    if(!cells.has(key({x:p.x+1,y:p.y})))add('v',p.x+1,p.y);
  }
  const segments:Segment[]=[];
  for(const [k,values] of rows) {
    const [axis,n]=k.split(':'), line=Number(n), sorted=[...new Set(values)].sort((a,b)=>a-b);
    for(let i=0;i<sorted.length;) {
      const start=sorted[i];let end=start+1; i++;
      while(i<sorted.length&&sorted[i]===end){end++;i++;}
      segments.push(axis==='h'?{a:{x:start,y:line},b:{x:end,y:line}}:{a:{x:line,y:start},b:{x:line,y:end}});
    }
  }
  return segments;
}
export const floorPath=(floor:Point[])=>floor.map(p=>`M${p.x} ${p.y}h1v1h-1z`).join('');
