export const SIZE = 11;
export const START_ATTACK = 3;
export const DEFENSE = 1;

export const directions = [
  { key: "ArrowUp", arrow: "↑", dx: 0, dy: -1 },
  { key: "ArrowRight", arrow: "→", dx: 1, dy: 0 },
  { key: "ArrowDown", arrow: "↓", dx: 0, dy: 1 },
  { key: "ArrowLeft", arrow: "←", dx: -1, dy: 0 },
] as const;

export type Direction = (typeof directions)[number];
export type Tile = "#" | "." | "S" | "E" | "D" | "K" | "P" | "W" | "M" | "G";

type Monster = { hp: number; attack: number; defense: number };

export const slime = { hp: 4, attack: 3, defense: 1 };
export const guard = { hp: 8, attack: 3, defense: 2 };

export interface Floor {
  tiles: Tile[];
  bits: number[];
  start: number;
  exit: number;
  startingHp: number;
  pickupValues: Record<number, number>;
  guard: Monster;
}

export interface GameState {
  position: number;
  hp: number;
  attack: number;
  keys: number;
  cleared: number;
}

export function makeFloor(tiles: Tile[], startingHp: number, pickupValues: Record<number, number>, enemy = guard): Floor {
  let interaction = 0;
  const bits = tiles.map((tile) => "DKPWMG".includes(tile) ? 1 << interaction++ : 0);
  return { tiles, bits, start: tiles.indexOf("S"), exit: tiles.indexOf("E"), startingHp, pickupValues, guard: enemy };
}

export function start(floor: Floor): GameState {
  return { position: floor.start, hp: floor.startingHp, attack: START_ATTACK, keys: 0, cleared: 0 };
}

export function tileAt(floor: Floor, state: GameState, position: number): Tile {
  return (state.cleared & floor.bits[position]) ? "." : floor.tiles[position];
}

export function fightCost(attack: number, enemy: Monster): number {
  const damage = attack - enemy.defense;
  if (damage <= 0) return Infinity;

  const hits = Math.ceil(enemy.hp / damage);
  return (hits - 1) * Math.max(0, enemy.attack - DEFENSE);
}

export function neighbor(position: number, direction: Direction): number | undefined {
  const x = position % SIZE + direction.dx;
  const y = Math.floor(position / SIZE) + direction.dy;
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  return y * SIZE + x;
}

export function move(floor: Floor, state: GameState, direction: Direction): GameState | undefined {
  const position = neighbor(state.position, direction);
  if (position === undefined) return;
  const tile = tileAt(floor, state, position);
  if (tile === "#") return;

  const next = { ...state, position, cleared: state.cleared | floor.bits[position] };
  switch (tile) {
    case "D":
      if (next.keys === 0) return;
      next.keys--;
      break;
    case "K":
      next.keys++;
      break;
    case "P":
      next.hp += floor.pickupValues[position];
      break;
    case "W":
      next.attack += floor.pickupValues[position];
      break;
    case "M":
    case "G":
      next.hp -= fightCost(next.attack, tile === "G" ? floor.guard : slime);
      if (next.hp <= 0) return;
      break;
  }
  return next;
}
