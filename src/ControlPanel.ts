import * as dat from "dat.gui";
import { utils, vec3 } from "wgpu-matrix";
import type CameraController from "./CameraController";
import type Renderer from "./Renderer";
import type { SceneOptions } from "./Scene";
import type Simulation from "./Simulation";
import { BASELINE_ALGORITHMS } from "./simulation/types";
import type { SimulationAlgorithms } from "./simulation/types";

export function createControlPanel(
  options: SceneOptions,
  simulation: Simulation,
  renderer: Renderer,
  cameraController: CameraController,
  regenerate: (options: SceneOptions) => void,
): void {
  const gui = new dat.GUI({ width: 330 });

  const initial = {
    seed: options.seed,
    initialBodyCount: options.initialBodyCount,
    initialVelocityRange: options.initialVelocityRange,
  };

  const boundary = {
    enabled: options.boundary?.enabled ?? false,
    min: vec3.clone(options.boundary?.min ?? [-10, -10, -10]),
    max: vec3.clone(options.boundary?.max ?? [10, 10, 10]),
  };

  const physics = {
    gravitationalConstant:
      options.simulationConfig.gravitationalConstant,
    softeningLength:
      options.simulationConfig.softeningLength,
    linearDragRate: options.simulationConfig.linearDragRate,
    starMass: options.simulationConfig.starMass,
    explosionMass: options.simulationConfig.explosionMass,
  };

  const camera = { fov: utils.radToDeg(renderer.camera.fovY) };

  const actions = {
    regenerate: () => {
      regenerate({
        ...options,
        ...initial,
        boundary: {
          enabled: boundary.enabled,
          min: vec3.clone(boundary.min),
          max: vec3.clone(boundary.max),
        },
        simulationConfig: {
          ...options.simulationConfig,
          ...physics,
        },
      });
    },

    resetCamera: () => {
      renderer.camera.position = vec3.create(0, 0, 30);
      renderer.camera.yaw = 0;
      renderer.camera.pitch = 0;
    },
  };

  const initialFolder = gui.addFolder("Initial Scene");
  initialFolder.add(initial, "seed", 0, 2147483647, 1);
  initialFolder.add(
    initial, "initialBodyCount",
    0, options.simulationConfig.capacity, 1,
  );
  initialFolder.add(initial, "initialVelocityRange", 0, 30, 0.1)
    .name("Initial Velocity Range");

  const boundaryFolder = initialFolder.addFolder("Boundary");
  boundaryFolder.add(boundary, "enabled").name("Enabled");
  const minimumSize = 2;
  const axes = ["X", "Y", "Z"];

  for (const [axis, name] of axes.entries()) {
    const min = boundaryFolder
      .add(boundary.min, axis, -100, boundary.max[axis] - minimumSize, 0.5)
      .name(`Min ${name}`);
    const max = boundaryFolder
      .add(boundary.max, axis, boundary.min[axis] + minimumSize, 100, 0.5)
      .name(`Max ${name}`);

    min.onChange(() => max.min(boundary.min[axis] + minimumSize).updateDisplay());
    max.onChange(() => min.max(boundary.max[axis] - minimumSize).updateDisplay());
  }

  initialFolder.add(actions, "regenerate").name("Regenerate");
  initialFolder.open();

  const updatePhysics = () => {
    simulation.setPhysics(
      physics.gravitationalConstant,
      physics.softeningLength,
      physics.linearDragRate,
    );
  };

  const physicsFolder = gui.addFolder("Physics");
  physicsFolder
    .add(physics, "gravitationalConstant", 0, 1, 0.0001)
    .onChange(updatePhysics);
  physicsFolder
    .add(physics, "softeningLength", 0.01, 2, 0.001)
    .onChange(updatePhysics);
  physicsFolder.add(physics, "linearDragRate", 0, 5, 0.01)
    .name("Linear Drag")
    .onChange(updatePhysics);

  const starMass = physicsFolder
    .add(physics, "starMass", 1, physics.explosionMass - 1, 1)
    .name("Star Mass (Regenerate)");
  const explosionMass = physicsFolder
    .add(physics, "explosionMass", physics.starMass + 1, 2000, 1)
    .name("Explosion Mass (Regenerate)");
  starMass.onChange(() => explosionMass.min(physics.starMass + 1));
  explosionMass.onChange(() => starMass.max(physics.explosionMass - 1));

  const algorithms: SimulationAlgorithms = { ...BASELINE_ALGORITHMS };
  const simulationFolder = gui.addFolder("Performance").addFolder("Simulation");
  const algorithmControllers = [
    simulationFolder.add(algorithms, "gravity", { Naive: "naive", Tiled: "tiled" }).name("Gravity"),
    simulationFolder.add(algorithms, "collision", { "All pairs": "all-pairs" }).name("Collision"),
    simulationFolder.add(algorithms, "absorption", { "Full scan": "full-scan" }).name("Absorption"),
    simulationFolder.add(algorithms, "compaction", { Serial: "serial", Scan: "scan" }).name("Compaction"),
    simulationFolder.add(algorithms, "explosion", { Serial: "serial" }).name("Explosion"),
  ];
  const updateAlgorithms = () => simulation.setAlgorithms(algorithms);
  algorithmControllers.forEach((controller) => controller.onChange(updateAlgorithms));
  simulationFolder.add({
    baseline: () => {
      Object.assign(algorithms, BASELINE_ALGORITHMS);
      updateAlgorithms();
      algorithmControllers.forEach((controller) => controller.updateDisplay());
    },
  }, "baseline").name("Baseline");

  const renderingFolder = gui.addFolder("Rendering");
  const updateRendering = () => renderer.updateRenderParams();
  renderingFolder.add(renderer, "mode", ["surface", "debug"]);
  renderingFolder.add(renderer, "bloomStrength", 0, 2, 0.01)
    .name("Bloom Strength")
    .onChange(updateRendering);
  renderingFolder.add(renderer, "exposure", 0.1, 4, 0.01)
    .name("Exposure")
    .onChange(updateRendering);
  renderingFolder.add(renderer, "bloomThreshold", 0, 2, 0.01)
    .name("Bloom Threshold")
    .onChange(updateRendering);
  renderingFolder.add(renderer, "starLightStrength", 0, 20, 0.1)
    .name("Star Light Strength")
    .onChange(updateRendering);

  const cameraFolder = gui.addFolder("Camera");
  cameraFolder.add(cameraController, "moveSpeed", 0.1, 100, 0.1);
  cameraFolder.add(
    cameraController, "mouseSensitivity", 0.01, 1, 0.01,
  );
  cameraFolder.add(camera, "fov", 30, 100, 1)
    .name("Field of View (°)")
    .onChange(() => {
      renderer.camera.fovY = utils.degToRad(camera.fov);
    });
  cameraFolder.add(actions, "resetCamera").name("Reset Camera");
}