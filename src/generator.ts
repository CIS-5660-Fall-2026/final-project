import { directions, fightCost, guard, makeFloor, neighbor, SIZE, START_ATTACK } from "./game";
import type { Tile } from "./game";
import { solve } from "./solver";

const demo = makeFloor([
  ".M.#...#...",
  ".P.#.......",
  "..W#...#...",
  "#D###.###.#",
  "SK.....#...",
  ".#####M#...",
  ".....M.....",
  "#D###.###G#",
  ".K.#...#...",
  ".W.#...#.E.",
  ".P.#...#...",
].join("").split("") as Tile[], 12, {
  [SIZE + 1]: 4,
  [2 * SIZE + 2]: 2,
  [9 * SIZE + 1]: 1,
  [10 * SIZE + 1]: 6,
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
const potionAmounts = [4, 5, 6, 7, 8, 9, 10];

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

function addExtras(tiles: Tile[], spots: number[], start: number, values: Record<number, number>, random: Random) {
  const corridors: number[] = [];
  const nearPickups: number[] = [];

  for (const position of spots) {
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

  const distances = freeWalkingDistances(tiles, start);
  const bonuses: Tile[] = [];
  if (random(2) === 1) bonuses.push("P");
  if (random(2) === 1) bonuses.push("W");
  const extraKeys = random(3);
  for (let i = 0; i < extraKeys; i++) bonuses.push("K");

  for (const tile of bonuses) {
    // Even around a loop, an unreached tile requires opening a door or fighting.
    const options = spots.filter((position) => tiles[position] === "." &&
      (distances[position] === -1 || (tile === "K" && distances[position] >= 6)));
    if (options.length === 0) return false;

    const position = options[random(options.length)];
    tiles[position] = tile;
    if (tile === "P") values[position] = potionAmounts[random(potionAmounts.length)];
    if (tile === "W") values[position] = 1 + random(2);
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
  if (leaves.length < 3) return;

  const exit = leaves.splice(random(leaves.length), 1)[0];
  const potion = leaves.splice(random(leaves.length), 1)[0];
  const sword = leaves[random(leaves.length)];
  const gated = new Set([exit, potion, sword]);

  function hasWallBetweenOpenings({ position }: Opening) {
    return passages.every(({ position: other }) => {
      const distance = Math.abs(position - other);
      const sameRow = Math.floor(position / SIZE) === Math.floor(other / SIZE);
      return distance !== SIZE && (!sameRow || distance > 1);
    });
  }

  // A slime guards a shortcut through the main area. The tree still gives a free way around it.
  const slimeOptions = openings.filter(({ a, b }) => !gated.has(a) && !gated.has(b)).filter(hasWallBetweenOpenings);
  if (slimeOptions.length === 0) return;
  const slimePassage = slimeOptions[random(slimeOptions.length)];
  passages.push(slimePassage);

  const extraLoops = 1 + random(2);
  for (let i = 0; i < extraLoops; i++) {
    const options = openings.filter(({ a, b }) => !gated.has(a) || !gated.has(b)).filter(hasWallBetweenOpenings);
    if (options.length === 0) {
      if (i === 0) return;
      break;
    }
    passages.push(options[random(options.length)]);
  }

  const tiles = roomAt.map<Tile>((room) => room < 0 ? "#" : ".");
  for (const opening of passages) {
    const { a, b, position } = opening;
    if (a === exit || b === exit) tiles[position] = "G";
    else if (gated.has(a) || gated.has(b)) tiles[position] = "D";
    else tiles[position] = opening === slimePassage ? "M" : ".";
  }

  function place(room: number, tile: Tile) {
    const positions = roomTiles[room];
    const position = positions.splice(random(positions.length), 1)[0];
    tiles[position] = tile;
    return position;
  }

  const entrances = [...roomTiles.keys()].filter((room) => !gated.has(room));
  const entrance = entrances[random(entrances.length)];
  const start = place(entrance, "S");
  place(entrance, "K");
  place(exit, "E");

  const enemy = { ...guard, hp: 7 + random(3) };
  const guardCost = fightCost(START_ATTACK, enemy);
  const startingHp = guardCost - random(3);
  const swordBonus = 1 + random(2);
  const swordSavings = guardCost - fightCost(START_ATTACK + swordBonus, enemy);
  const healingOptions = potionAmounts.filter((amount) => amount !== swordSavings);
  const values = {
    [place(potion, "P")]: healingOptions[random(healingOptions.length)],
    [place(sword, "W")]: swordBonus,
  };

  const spots = [...tiles.keys()].filter((position) => tiles[position] === "." &&
    roomAt[position] !== entrance && roomAt[position] !== exit);
  if (!addExtras(tiles, spots, start, values, random)) return;

  return makeFloor(tiles, startingHp, values, enemy);
}

export function generate(seed: string) {
  if (seed === "demo") return demoLevel;

  const random = seededRandom(seed);
  for (let attempt = 0; attempt < 8; attempt++) {
    const floor = makeCandidate(random);
    if (!floor) continue;
    const solution = solve(floor);
    if (solution) return { floor, solution };
  }
  return demoLevel;
}
