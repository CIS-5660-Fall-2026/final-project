import Renderer from "./Renderer";
import WebGpuContext from "./WebGpuContext";
import "./style.css"

const canvas = document.querySelector<HTMLCanvasElement>("#gpu-canvas");

if (!canvas) {
  throw new Error("Canvas #gpu-canvas was not found");
}

const gpuContext = await WebGpuContext.create(canvas);

const renderer = new Renderer(gpuContext);
renderer.start();