import type { Connection, Direction, Door, Dungeon, Parameters, Point, Room } from './types.ts';
import { center, directions, findRoute, inside, key, roomCells } from './grid.ts';
import { integer, random, shuffle } from './random.ts';

const BOUND = 48;
const MAX_ATTEMPTS = 1600;
const opposite = (d: Direction) => ((d+2)%4) as Direction;
type Proposal = { room: Room; cells: Point[]; direction: Direction };
const finite = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback;
export function normalizeParameters(p: Parameters): Parameters {
  return {seed: String(p.seed).trim().slice(0,120) || '1473', rooms:Math.round(Math.min(24,Math.max(8,finite(p.rooms,18)))),
    symmetry:Math.min(1,Math.max(0,finite(p.symmetry,0.65))), loops:Math.min(1,Math.max(0,finite(p.loops,0.5)))};
}
function proposal(parent: Room, d: Direction, w: number, h: number, gap: number): Proposal {
  const c=center(parent);
  const room: Room = {id:-1,x:c.x-Math.floor(w/2),y:c.y-Math.floor(h/2),w,h,heading:d,parent:parent.id};
  const cells: Point[]=[];
  if(d===0) {room.y=parent.y-gap-h; for(let y=parent.y-1;y>=room.y+h;y--) cells.push({x:c.x,y});}
  if(d===1) {room.x=parent.x+parent.w+gap; for(let x=parent.x+parent.w;x<room.x;x++) cells.push({x,y:c.y});}
  if(d===2) {room.y=parent.y+parent.h+gap; for(let y=parent.y+parent.h;y<room.y;y++) cells.push({x:c.x,y});}
  if(d===3) {room.x=parent.x-gap-w; for(let x=parent.x-1;x>=room.x+w;x--) cells.push({x,y:c.y});}
  return {room,cells,direction:d};
}
export function generateDungeon(input: Parameters): Dungeon {
  const parameters=normalizeParameters(input);
  const rng=random(parameters.seed+':layout');
  const rooms: Room[]=[{id:0,x:-3,y:-3,w:7,h:7,heading:0,parent:null}];
  const connections: Connection[]=[];
  const floor=new Map<string,Point>();
  roomCells(rooms[0]).forEach(p=>floor.set(key(p),p));
  const used=new Map<number,Set<Direction>>([[0,new Set()]]);
  let attempts=0;

  function pathClear(cells: Point[], from: Room, to: Room): boolean {
    if(!cells.length) return false;
    return cells.every(p=>{
      if(Math.abs(p.x)>BOUND || Math.abs(p.y)>BOUND || floor.has(key(p))) return false;
      // Keep unrelated floor away from the tunnel: every physical connection must have a graph edge.
      return directions.every(d=>{
        const n={x:p.x+d.x,y:p.y+d.y};
        return !floor.has(key(n)) || inside(n,from) || inside(n,to);
      });
    });
  }
  function canPlace(p: Proposal, parent: Room): boolean {
    const r=p.room;
    if(used.get(parent.id)!.has(p.direction)) return false;
    if(r.x < -BOUND || r.y < -BOUND || r.x+r.w>BOUND || r.y+r.h>BOUND) return false;
    // One-cell clearance prevents rooms touching without an explicit passage.
    for(let y=r.y-1;y<=r.y+r.h;y++) for(let x=r.x-1;x<=r.x+r.w;x++)
      if(floor.has(key({x,y}))) return false;
    return pathClear(p.cells,parent,r);
  }
  function accept(p: Proposal,parent: Room) {
    const r={...p.room,id:rooms.length}; rooms.push(r);
    used.get(parent.id)!.add(p.direction); used.set(r.id,new Set([opposite(p.direction)]));
    connections.push({id:connections.length,from:parent.id,to:r.id,cells:p.cells,kind:'tree'});
    [...roomCells(r),...p.cells].forEach(c=>floor.set(key(c),c));
  }
  while(rooms.length<parameters.rooms && attempts<MAX_ATTEMPTS) {
    attempts++;
    const available=rooms.filter(r=>used.get(r.id)!.size<4);
    if(!available.length) break;
    const parent=available[integer(rng,0,available.length-1)];
    const w=integer(rng,2,4)*2+1, h=integer(rng,2,4)*2+1, gap=integer(rng,2,5);
    const side=((parent.heading+1)%4) as Direction;
    if(rooms.length+2<=parameters.rooms && rng()<parameters.symmetry) {
      const a=proposal(parent,side,w,h,gap), b=proposal(parent,opposite(side),w,h,gap);
      if(canPlace(a,parent) && canPlace(b,parent)) {accept(a,parent);accept(b,parent);continue;}
    }
    for(const d of shuffle([parent.heading,side,opposite(side),opposite(parent.heading)],rng)) {
      const p=proposal(parent,d,w,h,gap);
      if(canPlace(p,parent)) {accept(p,parent);break;}
    }
  }

  // Milestone 1 uses straight extra passages where room projections overlap.
  // Room growth is independent of the loop stream, making density comparisons reproducible.
  const loopRng=random(parameters.seed+':loops');
  const candidates: {from:Room;to:Room;d:Direction;cells:Point[];roll:number}[]=[];
  for(const a of rooms) for(const b of rooms) {
    if(a.id>=b.id || connections.some(e=>(e.from===a.id&&e.to===b.id)||(e.from===b.id&&e.to===a.id))) continue;
    for(const horizontal of [true,false]) {
      const from=horizontal?(a.x<b.x?a:b):(a.y<b.y?a:b);
      const to=from===a?b:a;
      const start=horizontal?from.x+from.w:from.y+from.h;
      const end=horizontal?to.x:to.y;
      if(end-start<2 || end-start>12) continue;
      const lo=horizontal?Math.max(from.y,to.y)+1:Math.max(from.x,to.x)+1;
      const hi=horizontal?Math.min(from.y+from.h,to.y+to.h)-2:Math.min(from.x+from.w,to.x+to.w)-2;
      if(lo>hi) continue;
      const line=integer(loopRng,lo,hi), cells:Point[]=[];
      for(let i=start;i<end;i++) cells.push(horizontal?{x:i,y:line}:{x:line,y:i});
      candidates.push({from,to,d:horizontal?1:2,cells,roll:loopRng()});
    }
  }
  candidates.sort((a,b)=>a.cells.length-b.cells.length);
  for(const c of candidates) {
    if(c.roll>=parameters.loops || used.get(c.from.id)!.has(c.d) || used.get(c.to.id)!.has(opposite(c.d))) continue;
    if(!pathClear(c.cells,c.from,c.to)) continue;
    connections.push({id:connections.length,from:c.from.id,to:c.to.id,cells:c.cells,kind:'loop'});
    used.get(c.from.id)!.add(c.d);used.get(c.to.id)!.add(opposite(c.d));
    c.cells.forEach(p=>floor.set(key(p),p));
  }

  const doors:Door[]=[];
  for(const e of connections) for(const [roomId,p] of [[e.from,e.cells[0]],[e.to,e.cells.at(-1)!]] as [number,Point][]) {
    const room=rooms[roomId];
    for(let d=0;d<4;d++) {
      const v=directions[d], n={x:p.x-v.x,y:p.y-v.y};
      if(inside(n,room)) {doors.push({x:p.x+0.5-v.x*0.5,y:p.y+0.5-v.y*0.5,direction:d as Direction,room:roomId,connection:e.id});break;}
    }
  }
  const distances=new Map<number,number>([[0,0]]), queue=[0];
  for(let i=0;i<queue.length;i++) for(const e of connections) {
    const n=e.from===queue[i]?e.to:e.to===queue[i]?e.from:-1;
    if(n>=0&&!distances.has(n)) {distances.set(n,distances.get(queue[i])!+1);queue.push(n);}
  }
  let exitRoom=0;
  for(const [id,dist] of distances) if(dist>distances.get(exitRoom)!) exitRoom=id;
  const entrance=center(rooms[0]), exit=center(rooms[exitRoom]);
  const sortedFloor=[...floor.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
  return {version:'0.1.0',parameters,rooms,connections,doors,floor:sortedFloor,entrance,exit,exitRoom,
    route:findRoute(entrance,exit,new Set(floor.keys())),attempts,bound:BOUND,
    warnings:rooms.length<parameters.rooms?[`Placed ${rooms.length} of ${parameters.rooms} requested rooms within the placement budget.`]:[]};
}
