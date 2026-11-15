import { directions, fightCost, guard, makeFloor, neighbor, SIZE, START_ATTACK } from "./game";
import type { Tile } from "./game";
import { solve } from "./solver";

const demo = makeFloor([
  ".M.#...#...",
  ".P.....M...",
  "..W#...#...",
  "#####D###M#",
  "SK.....#...",
  ".#####M#...",
  ".......D...",
  "#M###D###G#",
  ".K.#...#...",
  ".W.#.P.#.E.",
  "...#...#...",
].join("").split("") as Tile[], 12, {
  [SIZE + 1]: 4,
  [2 * SIZE + 2]: 2,
  [9 * SIZE + 1]: 1,
  [9 * SIZE + 5]: 6,
});
const demoLevel = { floor: demo, solution: solve(demo)! };

function seededRandom(seed: string) {
  let state = 2166136261;
  for (const character of seed) {
    state = Math.imul(state ^ character.codePointAt(0)!, 16777619);
  }

  return (limit: number) => {
    state = Math.imul(state, 1664525) + 1013904223;
    return Math.floor((state >>> 0) / 2 ** 32 * limit);
  };
}

type Random = ReturnType<typeof seededRandom>;
type Opening = { a: number; b: number; position: number };

function divideRooms(random: Random) {
  const rooms = [{ x: 0, y: 0, width: SIZE, height: SIZE }];
  const target = 8 + random(3);

  while (rooms.length < target) {
    const cuts: { index: number; vertical: boolean; min: number; count: number }[] = [];
    for (const [index, { width, height }] of rooms.entries()) {
      if (width === 1 || height === 1) continue;

      // A split can leave a one-tile-wide corridor if it is at least four tiles long.
      const minWidth = height >= 4 ? 1 : 2;
      const minHeight = width >= 4 ? 1 : 2;
      if (width > 2 * minWidth) cuts.push({ index, vertical: true, min: minWidth, count: width - 2 * minWidth });
      if (height > 2 * minHeight) cuts.push({ index, vertical: false, min: minHeight, count: height - 2 * minHeight });
    }
    if (cuts.length === 0) break;

    const { index, vertical, min, count } = cuts[random(cuts.length)];
    const room = rooms[index];
    const split = min + random(count);
    if (vertical) {
      rooms.splice(index, 1,
        { ...room, width: split },
        { ...room, x: room.x + split + 1, width: room.width - split - 1 });
    } else {
      rooms.splice(index, 1,
        { ...room, height: split },
        { ...room, y: room.y + split + 1, height: room.height - split - 1 });
    }
  }

  return rooms;
}

function findOpenings(roomAt: number[]) {
  const openings: Opening[] = [];

  function add(position: number, a: number, b: number) {
    if (a >= 0 && b >= 0 && a !== b) openings.push({ a, b, position });
  }

  for (const [position, room] of roomAt.entries()) {
    if (room >= 0) continue;

    const x = position % SIZE;
    const y = Math.floor(position / SIZE);
    if (x > 0 && x < SIZE - 1) add(position, roomAt[position - 1], roomAt[position + 1]);
    if (y > 0 && y < SIZE - 1) add(position, roomAt[position - SIZE], roomAt[position + SIZE]);
  }
  return openings;
}

function freeWalkingDistances(tiles: Tile[], start: number) {
  const distances = tiles.map(() => -1);
  const queue = [start];
  distances[start] = 0;

  for (const position of queue) {
    for (const direction of directions) {
      const next = neighbor(position, direction);
      if (next === undefined || distances[next] !== -1 || "#DMG".includes(tiles[next])) continue;
      distances[next] = distances[position] + 1;
      queue.push(next);
    }
  }
  return distances;
}

function addSlimesAndKeys(tiles: Tile[], spots: number[], start: number, random: Random) {
  const corridors: number[] = [];
  const nearPickups: number[] = [];

  for (const position of spots) {
    if (tiles[position] !== ".") continue;
    const adjacent = directions.map((direction) => {
      const next = neighbor(position, direction);
      return next === undefined ? "#" : tiles[next];
    });
    const [north, east, south, west] = adjacent.map((tile) => tile !== "#");
    if ((north && south && !east && !west) || (east && west && !north && !south)) corridors.push(position);
    if (adjacent.some((tile) => "KPW".includes(tile))) nearPickups.push(position);
  }

  const monsterSpots = [...new Set([...corridors, ...nearPickups])];
  const monsterCount = 1 + random(4);
  for (let i = 0; i < monsterCount; i++) {
    const preferred = i % 2 === 0 ? corridors : nearPickups;
    let options = preferred.filter((position) => tiles[position] === ".");
    if (options.length === 0) options = monsterSpots.filter((position) => tiles[position] === ".");
    if (options.length === 0) return false;
    tiles[options[random(options.length)]] = "M";
  }

  const extraKeys = random(3);
  if (extraKeys === 0) return true;

  const distances = freeWalkingDistances(tiles, start);
  const options = spots.filter((position) => tiles[position] === "." &&
    (distances[position] === -1 || distances[position] >= 6));
  if (options.length < extraKeys) return false;

  for (let i = 0; i < extraKeys; i++) {
    const position = options.splice(random(options.length), 1)[0];
    tiles[position] = "K";
  }
  return true;
}

function makeCandidate(random: Random) {
  const roomAt = Array<number>(SIZE * SIZE).fill(-1);
  const roomTiles = divideRooms(random).map(({ x, y, width, height }, room) => {
    const positions: number[] = [];
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        const position = row * SIZE + col;
        roomAt[position] = room;
        positions.push(position);
      }
    }
    return positions;
  });

  const openings = findOpenings(roomAt);
  const passages: Opening[] = [];
  const connected = new Set([random(roomTiles.length)]);
  const degree = roomTiles.map(() => 0);
  while (connected.size < roomTiles.length) {
    const options = openings.filter(({ a, b }) => connected.has(a) !== connected.has(b));
    const opening = options[random(options.length)];
    passages.push(opening);
    connected.add(opening.a).add(opening.b);
    degree[opening.a]++;
    degree[opening.b]++;
  }

  const leaves = [...degree.keys()].filter((room) => degree[room] === 1);
  const exit = leaves[random(leaves.length)];

  function hasWallBetweenOpenings({ position }: Opening) {
    return passages.every(({ position: other }) => {
      const distance = Math.abs(position - other);
      const sameRow = Math.floor(position / SIZE) === Math.floor(other / SIZE);
      return distance !== SIZE && (!sameRow || distance > 1);
    });
  }

  const extraLoops = 2 + random(2);
  for (let i = 0; i < extraLoops; i++) {
    const options = openings.filter(hasWallBetweenOpenings);
    if (options.length === 0) {
      if (i < 2) return;
      break;
    }
    passages.push(options[random(options.length)]);
  }

  const tiles = roomAt.map<Tile>((room) => room < 0 ? "#" : ".");
  const mainPassages: number[] = [];
  for (const { a, b, position } of passages) {
    if (a === exit || b === exit) tiles[position] = "G";
    else {
      tiles[position] = ".";
      mainPassages.push(position);
    }
  }

  const costlyPassages = Math.round(mainPassages.length * 0.8);
  for (let i = 0; i < costlyPassages; i++) {
    const position = mainPassages.splice(random(mainPassages.length), 1)[0];
    tiles[position] = i === 0 || random(3) === 0 ? "D" : "M";
  }

  function place(room: number, tile: Tile) {
    const positions = roomTiles[room];
    const position = positions.splice(random(positions.length), 1)[0];
    tiles[position] = tile;
    return position;
  }

  const entrances = [...roomTiles.keys()].filter((room) => room !== exit);
  const entrance = entrances[random(entrances.length)];
  const start = place(entrance, "S");
  place(entrance, "K");
  place(exit, "E");

  const spots = [...tiles.keys()].filter((position) => {
    const room = roomAt[position];
    return tiles[position] === "." && room >= 0 && room !== entrance && room !== exit;
  });
  const distances = freeWalkingDistances(tiles, start);
  const guarded = spots.filter((position) => distances[position] === -1);
  const potionCount = 1 + random(2);
  const swordCount = 1 + random(2);
  if (guarded.length < potionCount + swordCount) return;

  const values: Record<number, number> = {};
  for (const [tile, count] of [["P", potionCount], ["W", swordCount]] as const) {
    for (let i = 0; i < count; i++) {
      const position = guarded.splice(random(guarded.length), 1)[0];
      tiles[position] = tile;
      values[position] = tile === "P" ? 4 + random(7) : 1 + random(2);
    }
  }

  if (!addSlimesAndKeys(tiles, spots, start, random)) return;

  const enemy = { ...guard, hp: 7 + random(3) };
  const guardCost = fightCost(START_ATTACK, enemy);
  const startingHp = guardCost - random(3);
  return makeFloor(tiles, startingHp, values, enemy);
}

export function generate(seed: string) {
  if (seed === "demo") return demoLevel;

  const random = seededRandom(seed);
  for (let attempt = 0; attempt < 8; attempt++) {
    const floor = makeCandidate(random);
    if (!floor || !solve(floor, "P")) continue;
    const solution = solve(floor, "W");
    if (solution) return { floor, solution };
  }
  return demoLevel;
}
