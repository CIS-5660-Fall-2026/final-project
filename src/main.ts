import Renderer from "./Renderer";
import Scene from "./Scene";
import WebGpuContext from "./WebGpuContext";
import "./style.css"

const canvas = document.querySelector<HTMLCanvasElement>("#gpu-canvas");

if (!canvas) {
  throw new Error("Canvas #gpu-canvas was not found");
}

canvas.width = Math.round(canvas.clientWidth * window.devicePixelRatio);
canvas.height = Math.round(canvas.clientHeight * window.devicePixelRatio);

const gpuContext = await WebGpuContext.create(canvas);

const scene = new Scene({
  seed: 0,
  initialBodyCount: 100,
  simulationConfig: {
    capacity: 10000,
    fixedDt: 1 / 120,
    gravitationalConstant: 1,
    softeningLength: 0.1
  }
});

const renderer = new Renderer(gpuContext, scene);
renderer.start();