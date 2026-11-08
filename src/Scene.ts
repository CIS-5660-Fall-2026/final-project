import { quat, vec3, type Vec3 } from "wgpu-matrix";
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
  readonly boundary?: Readonly<BoxBoundary>;

  constructor(options: SceneOptions) {
    this.seed = options.seed;
    this.simulationConfig = { ...options.simulationConfig };
    this.boundary = options.boundary;

    const rng = seedrandom(String(this.seed));
    const range = (min: number, max: number): number =>
      min + (max - min) * rng();

    const min = this.boundary?.min ?? vec3.create(-10, -10, -10);
    const max = this.boundary?.max ?? vec3.create(10, 10, 10);
    const bodies: BodyInitialState[] = [];

    for (let i = 0; i < options.initialBodyCount; i++) {
      const mass = range(1, 20);
      const density = range(10, 30);
      const radius = Math.cbrt(3 * mass / (4 * Math.PI * density));

      const position = vec3.fromValues(
        range(min[0] + radius, max[0] - radius),
        range(min[1] + radius, max[1] - radius),
        range(min[2] + radius, max[2] - radius)
      )

      bodies.push({
        position, 
        velocity: vec3.create(), 
        mass, 
        radius,
        orientation: quat.identity(),
        angularVelocity: vec3.create(0, range(0.1, 1.0), 0)
      });
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

export class SimulationUniforms {
  public readonly buffer = new ArrayBuffer(48);
  private readonly floatView = new Float32Array(this.buffer);
  private readonly uintView = new Uint32Array(this.buffer);

  set fixedDt(value: number) {
    this.floatView[0] = value;
  }

  set gravitationalConstant(value: number) {
    this.floatView[1] = value;
  }

  set softeningLength(value: number) {
    this.floatView[2] = value;
  }

  set bodyCount(value: number) {
    this.uintView[3] = value;
  }

  set boundary(boundary: BoxBoundary) {
    this.floatView.set(boundary.min, 4);
    this.uintView[7] = 1;
    this.floatView.set(boundary.max, 8);
  }
}