import type { Dungeon, Validation } from './types.ts';
import { center, directions, inside, key, roomCells, walk } from './grid.ts';
export function validateDungeon(d: Dungeon): Validation {
  const errors:string[]=[];
  const expected=new Set<string>(), occupiedRooms=new Set<string>();
  const ids=new Set<number>();
  for(const r of d.rooms) {
    if(ids.has(r.id)) errors.push('Duplicate room ID'); ids.add(r.id);
    if(r.w<=0||r.h<=0||![r.x,r.y,r.w,r.h].every(Number.isInteger)) errors.push('Invalid room geometry');
    for(const p of roomCells(r)) {
      if(occupiedRooms.has(key(p))) errors.push('Overlapping room interiors');
      if(Math.abs(p.x)>d.bound||Math.abs(p.y)>d.bound) errors.push('Room outside grid bounds');
      occupiedRooms.add(key(p));expected.add(key(p));
    }
  }
  const adjacency=new Map(d.rooms.map(r=>[r.id,new Set<number>()]));
  const pairs=new Set<string>();
  for(const e of d.connections) {
    if(!ids.has(e.from)||!ids.has(e.to)||e.from===e.to) {errors.push('Invalid graph edge');continue;}
    const pair=[e.from,e.to].sort((a,b)=>a-b).join(',');
    if(pairs.has(pair)) errors.push('Duplicate room connection'); pairs.add(pair);
    adjacency.get(e.from)!.add(e.to);adjacency.get(e.to)!.add(e.from);
    const from=d.rooms.find(r=>r.id===e.from)!, to=d.rooms.find(r=>r.id===e.to)!;
    if(!e.cells.length) {errors.push('Empty corridor');continue;}
    const touches=(p: typeof d.entrance,r:typeof from)=>directions.some(v=>inside({x:p.x+v.x,y:p.y+v.y},r));
    if(!touches(e.cells[0],from)||!touches(e.cells.at(-1)!,to)) errors.push('Corridor misses an endpoint room');
    e.cells.forEach((p,i)=>{
      if(occupiedRooms.has(key(p))) errors.push('Corridor crosses a room interior');
      if(Math.abs(p.x)>d.bound||Math.abs(p.y)>d.bound) errors.push('Corridor outside grid bounds');
      if(i&&Math.abs(p.x-e.cells[i-1].x)+Math.abs(p.y-e.cells[i-1].y)!==1) errors.push('Broken corridor');
      expected.add(key(p));
    });
  }
  const floor=new Set(d.floor.map(key));
  if(floor.size!==d.floor.length||floor.size!==expected.size||[...expected].some(k=>!floor.has(k))) errors.push('Walkable grid disagrees with geometry');
  const reached=new Set<number>(), queue=d.rooms.length?[d.rooms[0].id]:[];
  queue.forEach(id=>reached.add(id));
  for(let i=0;i<queue.length;i++) for(const id of adjacency.get(queue[i])??[]) if(!reached.has(id)){reached.add(id);queue.push(id);}
  if(reached.size!==d.rooms.length) errors.push('Disconnected room graph');
  const reachable=walk(d.entrance,floor).queue;
  if(reachable.length!==floor.size) errors.push('Disconnected floor geometry');
  const unseen=new Set(floor);let components=0;
  while(unseen.size) {components++;const [x,y]=unseen.values().next().value!.split(',').map(Number);for(const p of walk({x,y},floor).queue) unseen.delete(key(p));}
  if(!floor.has(key(d.entrance))||!floor.has(key(d.exit))) errors.push('Entrance or exit outside floor');
  if(!d.route.length||key(d.route[0])!==key(d.entrance)||key(d.route.at(-1)!)!==key(d.exit)) errors.push('Invalid route endpoints');
  if(d.route.some((p,i)=>!floor.has(key(p))||(i>0&&Math.abs(p.x-d.route[i-1].x)+Math.abs(p.y-d.route[i-1].y)!==1))) errors.push('Route leaves walkable floor');
  if(d.rooms.some(r=>!floor.has(key(center(r))))) errors.push('Missing room center');
  if(d.doors.length!==d.connections.length*2) errors.push('Missing door opening');
  return {valid:!errors.length,errors:[...new Set(errors)],reachableRooms:reached.size,reachableCells:reachable.length,components,loops:d.connections.length-d.rooms.length+components};
}
