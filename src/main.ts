import { DEFENSE, directions, fightCost, move, slime, start, tileAt } from "./game";
import type { Tile } from "./game";
import { generate } from "./generator";

const form = document.querySelector<HTMLFormElement>("#floor-form")!;
const seed = document.querySelector<HTMLInputElement>("#seed")!;
const board = document.querySelector<HTMLDivElement>("#board")!;
const stats = document.querySelector<HTMLParagraphElement>("#stats")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const solutionPanel = document.querySelector<HTMLDetailsElement>("#solution")!;
const solutionMoves = document.querySelector<HTMLParagraphElement>("#solution-moves")!;

const names: Record<Tile, string> = {
  "#": "Wall", ".": "Floor", S: "Entrance", E: "Stairs", D: "Door",
  K: "Key", P: "Potion", W: "Sword", M: "Slime", G: "Guard",
};

let { floor, solution } = generate(seed.value);
let state = start(floor);
const cells = floor.tiles.map(() => document.createElement("span"));
board.append(...cells);

function render() {
  stats.textContent = `HP ${state.hp} · ATK ${state.attack} · DEF ${DEFENSE} · Keys ${state.keys}`;

  cells.forEach((cell, position) => {
    const tile = tileAt(floor, state, position);
    const isPlayer = position === state.position;
    cell.dataset.tile = isPlayer ? "@" : tile;
    cell.textContent = isPlayer ? "@" : tile === "#" || tile === "." ? "" : tile;
    cell.title = isPlayer ? "Player" : names[tile];

    if (tile === "P" || tile === "W") {
      const amount = floor.pickupValues[position];
      const stat = tile === "P" ? "HP" : "ATK";
      cell.title = `${names[tile]} (+${amount} ${stat})`;
      const bonus = document.createElement("small");
      bonus.textContent = `+${amount}`;
      cell.append(bonus);
    }
    if (tile === "M" || tile === "G") {
      const cost = fightCost(state.attack, tile === "G" ? floor.guard : slime);
      const damage = document.createElement("small");
      damage.textContent = Number.isFinite(cost) ? String(cost) : "×";
      damage.classList.toggle("lethal", cost >= state.hp);
      cell.title = `${names[tile]} · ${Number.isFinite(cost) ? `${cost} HP` : "Cannot damage"}`;
      cell.append(damage);
    }
  });
}

function restart() {
  state = start(floor);
  status.textContent = "Pick up a key to open a door. Monster tiles show the HP cost to fight.";
  render();
}

function showSolution() {
  const moves = solution.moves.map((direction) => direction.arrow).join(" ");
  solutionMoves.textContent = `From the entrance, follow ${moves} to finish with ${solution.hp} HP.`;
  solutionPanel.open = false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  seed.value = seed.value.trim() || "demo";
  ({ floor, solution } = generate(seed.value));
  seed.blur();
  showSolution();
  restart();
});

document.querySelector("#restart")!.addEventListener("click", restart);

document.addEventListener("keydown", (event) => {
  const direction = directions.find(({ key }) => key === event.key);
  if (!direction || event.target === seed) return;
  event.preventDefault();
  if (state.position === floor.exit) return;

  const next = move(floor, state, direction);
  if (!next) {
    status.textContent = "That move is blocked.";
    return;
  }

  state = next;
  status.textContent = state.position === floor.exit ? `You escaped with ${state.hp} HP.` : "";
  render();
});

showSolution();
restart();
