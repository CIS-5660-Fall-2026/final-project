import { vec3, type Vec3 } from "wgpu-matrix";
import type { BodyInitialState } from "./Body";
import seedrandom from "seedrandom";

interface SceneOptions {
  seed: number;
  initialBodyCount: number;
  simulationConfig: Readonly<SimulationConfig>;
  boundary?: Readonly<BoxBoundary>;
}

export default class Scene {
  readonly seed: number;
  readonly initialBodies: readonly BodyInitialState[];
  readonly simulationConfig: Readonly<SimulationConfig>;
  readonly boundary: Readonly<BoxBoundary>;

  constructor(options: SceneOptions) {
    this.seed = options.seed;
    this.simulationConfig = { ...options.simulationConfig };
    this.boundary = options.boundary ?? {
      min: vec3.fromValues(-10, -10, -10), 
      max: vec3.fromValues(10, 10, 10)
    };

    const rng = seedrandom(String(this.seed));
    const range = (min: number, max: number): number =>
      min + (max - min) * rng();

    const bodies: BodyInitialState[] = [];

    for (let i = 0; i < options.initialBodyCount; i++) {
      const position = vec3.fromValues(
        range(this.boundary.min[0], this.boundary.max[0]),
        range(this.boundary.min[1], this.boundary.max[1]),
        range(this.boundary.min[2], this.boundary.max[2])
      )
      const mass = range(1, 8);
      const density = range(10, 30);
      const radius = Math.cbrt(3 * mass / (4 * Math.PI * density));

      bodies.push({
        position, 
        velocity: vec3.create(), 
        mass, 
        radius
      })
    }

    this.initialBodies = bodies;
  }
}

interface BoxBoundary {
  min: Vec3;
  max: Vec3;
}

interface SimulationConfig {
  capacity: number;
  fixedDt: number;
  gravitationalConstant: number;
  softeningLength: number;
}