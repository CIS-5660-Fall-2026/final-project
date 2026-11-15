import { directions, move, start } from "./game";
import type { Direction, Floor, GameState } from "./game";

interface Solution {
  moves: Direction[];
  hp: number;
}

export function solve(floor: Floor, requiredPickup?: "P" | "W"): Solution | undefined {
  const visited = new Set<string>();
  const pickupBits = floor.tiles.reduce((bits, tile, position) =>
    tile === requiredPickup ? bits | floor.bits[position] : bits, 0);

  function search(state: GameState): Solution | undefined {
    const key = `${state.position},${state.hp},${state.attack},${state.keys},${state.cleared}`;
    if (visited.has(key) || visited.size >= 5_000) return;
    visited.add(key);

    const reachable = [{ state, moves: [] as Direction[] }];
    const seenTiles = new Set([state.position]);

    for (const step of reachable) {
      if (step.state.position === floor.exit) {
        if (requiredPickup === undefined || (step.state.cleared & pickupBits) !== 0) {
          return { moves: step.moves, hp: step.state.hp };
        }
        continue;
      }

      for (const direction of directions) {
        const next = move(floor, step.state, direction);
        if (!next || seenTiles.has(next.position)) continue;
        seenTiles.add(next.position);

        const moves = [...step.moves, direction];
        if (next.cleared === state.cleared) {
          reachable.push({ state: next, moves });
        } else {
          // Doors, fights, and pickups change the state. Explore them as separate choices.
          const solution = search(next);
          if (solution) return { hp: solution.hp, moves: [...moves, ...solution.moves] };
        }
      }
    }
  }

  return search(start(floor));
}
