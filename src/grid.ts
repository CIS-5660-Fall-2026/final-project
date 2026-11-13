import type { Point, Room } from './types.ts';
export const key = (p: Point) => `${p.x},${p.y}`;
export const directions: Point[] = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];
export const center = (r: Room): Point => ({ x: r.x + Math.floor(r.w/2), y: r.y + Math.floor(r.h/2) });
export const inside = (p: Point, r: Room) => p.x >= r.x && p.x < r.x+r.w && p.y >= r.y && p.y < r.y+r.h;
export function roomCells(r: Room): Point[] {
  const cells: Point[] = [];
  for(let y=r.y; y<r.y+r.h; y++) for(let x=r.x; x<r.x+r.w; x++) cells.push({x,y});
  return cells;
}
export function walk(start: Point, floor: Set<string>) {
  const queue: Point[] = [];
  const previous = new Map<string, Point | null>();
  if (!floor.has(key(start))) return { queue, previous };
  queue.push(start); previous.set(key(start), null);
  for(let i=0; i<queue.length; i++) for(const d of directions) {
    const n = {x:queue[i].x+d.x, y:queue[i].y+d.y};
    if(floor.has(key(n)) && !previous.has(key(n))) { previous.set(key(n),queue[i]); queue.push(n); }
  }
  return { queue, previous };
}
export function findRoute(start: Point, end: Point, floor: Set<string>): Point[] {
  const {previous} = walk(start, floor);
  if(!previous.has(key(end))) return [];
  const path: Point[] = [];
  let p: Point | null = end;
  while(p) { path.push(p); p=previous.get(key(p)) ?? null; }
  return path.reverse();
}
