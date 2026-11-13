import * as dat from "dat.gui";
import { vec3 } from "wgpu-matrix";
import type CameraController from "./CameraController";
import type Renderer from "./Renderer";
import type { SceneOptions } from "./Scene";
import type Simulation from "./Simulation";

export function createControlPanel(
  options: SceneOptions,
  simulation: Simulation,
  renderer: Renderer,
  cameraController: CameraController,
  regenerate: (options: SceneOptions) => void,
): void {
  const gui = new dat.GUI();

  const initial = {
    seed: options.seed,
    initialBodyCount: options.initialBodyCount,
  };

  const physics = {
    gravitationalConstant:
      options.simulationConfig.gravitationalConstant,
    softeningLength:
      options.simulationConfig.softeningLength,
  };

  const actions = {
    regenerate: () => {
      regenerate({
        ...options,
        ...initial,
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
  initialFolder.add(actions, "regenerate").name("Regenerate");
  initialFolder.open();

  const updatePhysics = () => {
    simulation.setPhysics(
      physics.gravitationalConstant,
      physics.softeningLength,
    );
  };

  const physicsFolder = gui.addFolder("Physics");
  physicsFolder
    .add(physics, "gravitationalConstant", 0, 1, 0.0001)
    .onChange(updatePhysics);
  physicsFolder
    .add(physics, "softeningLength", 0.01, 2, 0.001)
    .onChange(updatePhysics);

  const renderingFolder = gui.addFolder("Rendering");
  renderingFolder.add(renderer, "mode", ["surface", "debug"]);

  const cameraFolder = gui.addFolder("Camera");
  cameraFolder.add(cameraController, "moveSpeed", 0.1, 100, 0.1);
  cameraFolder.add(
    cameraController, "mouseSensitivity", 0.01, 1, 0.01,
  );
  cameraFolder.add(actions, "resetCamera").name("Reset Camera");
}