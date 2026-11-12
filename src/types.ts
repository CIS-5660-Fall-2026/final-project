export interface Point { x: number; y: number }
export type Direction = 0 | 1 | 2 | 3;
export interface Room extends Point { id: number; w: number; h: number; heading: Direction; parent: number | null }
export interface Connection { id: number; from: number; to: number; cells: Point[]; kind: 'tree' | 'loop' }
export interface Door extends Point { direction: Direction; room: number; connection: number }
export interface Parameters { seed: string; rooms: number; symmetry: number; loops: number }
export interface Dungeon {
  version: '0.1.0'; parameters: Parameters; rooms: Room[]; connections: Connection[];
  doors: Door[]; floor: Point[]; entrance: Point; exit: Point; exitRoom: number;
  route: Point[]; attempts: number; bound: number; warnings: string[];
}
export interface Validation { valid: boolean; errors: string[]; reachableRooms: number; reachableCells: number; components: number; loops: number }
export interface DrawingSettings { view: 'ink' | 'geometry' | 'graph'; hatch: number; grid: boolean; route: boolean }
export const DEFAULT_PARAMETERS: Parameters = { seed: '1473', rooms: 18, symmetry: 0.65, loops: 0.5 };
export const DEFAULT_DRAWING: DrawingSettings = { view: 'ink', hatch: 0.55, grid: true, route: false };
