import { vec3 } from "wgpu-matrix";
import CameraController from "./CameraController";
import Renderer from "./Renderer";
import Scene, { type SceneOptions } from "./Scene";
import Simulation from "./Simulation";
import WebGpuContext from "./WebGpuContext";
import "./style.css"
import { createControlPanel } from "./ControlPanel";

const canvas = document.querySelector<HTMLCanvasElement>("#gpu-canvas");

if (!canvas) {
  throw new Error("Canvas #gpu-canvas was not found");
}

canvas.width = Math.round(canvas.clientWidth * window.devicePixelRatio);
canvas.height = Math.round(canvas.clientHeight * window.devicePixelRatio);

const gpuContext = await WebGpuContext.create(canvas);

const sceneOptions: SceneOptions = {
  seed: 0,
  initialBodyCount: 500,
  simulationConfig: {
    capacity: 100000,
    fixedDt: 1 / 120,
    gravitationalConstant: 0.1,
    softeningLength: 0.1
  },
  boundary: {
    min: vec3.create(-20, -10, -10), 
    max: vec3.create(20, 10, 10)
  }
};

const scene = new Scene(sceneOptions);

const simulation = new Simulation(gpuContext.device, scene);

const renderer = new Renderer(
  gpuContext, 
  simulation.bodiesBuffer, 
  simulation.collisionCandidatesBuffer
);

const cameraController = new CameraController(canvas, renderer.camera);

let previousTime: number | undefined;
let accTime: number = 0;

createControlPanel(
  sceneOptions,
  simulation,
  renderer,
  cameraController,
  (options) => {
    const newScene = new Scene(options);

    simulation.reset(newScene);

    accTime = 0;
    previousTime = undefined;
  },
);

const frame = (time: number): void => {
  const dt = previousTime === undefined 
    ? 0 : Math.min((time - previousTime) * 0.001, 0.1);
  
  previousTime = time;
  accTime += dt;

  const device = gpuContext.device;
  const encoder = device.createCommandEncoder();
  const fixedDt = scene.simulationConfig.fixedDt;

  while (accTime >= fixedDt) {
    simulation.encodeStep(encoder);
    accTime -= fixedDt;
  }

  cameraController.update(dt);

  renderer.onFrame();
  renderer.encode(encoder, simulation.simulationParamsBuffer);

  device.queue.submit([encoder.finish()]);
  
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);