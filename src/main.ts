import Stats from 'stats.js';

import { initWebGPU, Renderer } from './renderer';
import { DitherRenderer } from './renderers/dither';

import { setupLoaders, Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';

await initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf('./scenes/sponza/Sponza.gltf');

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

function setRenderer() {
    renderer?.stop();
    renderer = new DitherRenderer(stage);
}

setRenderer();