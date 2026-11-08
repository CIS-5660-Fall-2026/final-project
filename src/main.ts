import {vec3} from 'gl-matrix';
import Stats from 'stats-js';
import * as DAT from 'dat.gui';
import Icosphere from './geometry/Icosphere';
import Square from './geometry/Square';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import Camera from './Camera';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';

import lambertVertSource from './shaders/lambert-vert.glsl?raw';
import lambertFragSource from './shaders/lambert-frag.glsl?raw';
import customVertSource from './shaders/custom-vert.glsl?raw';
import customFragSource from './shaders/custom-frag.glsl?raw';
import ditherVertSource from './shaders/dither-vert.glsl?raw';
import ditherFragSource from './shaders/dither-frag.glsl?raw';
import backgroundVertSource from './shaders/background-vert.glsl?raw';
import backgroundFragSource from './shaders/background-frag.glsl?raw';

// Define an object with application parameters and button callbacks
// This will be referred to by dat.GUI's functions that add GUI elements.

const defaultParams = {
  tesselations: 5,
  temperature: 0.0,
  height: 0.3,
  curl: 0.4,
};

const defaults = Object.freeze(Object.assign({}, defaultParams));

const controls = {
  tesselations: 5,
  'Load Scene': loadScene, // A function pointer, essentially
  temperature: 0.0,
  height: 0.3,
  curl: 0.4,
  'Reset Defaults': resetDefaults,
};

let icosphere: Icosphere;
let square: Square;
let prevTesselations: number = 5;
let time: number = 0.0;
let prevTemperature: number = 0.0;
let prevHeight: number = 0.3;
let prevCurl: number = 0.4;

const gui = new DAT.GUI();

function resetDefaults() {
  controls.tesselations = defaults.tesselations;
  controls.height = defaults.height;
  controls.curl = defaults.curl;
  controls.temperature = defaults.temperature;
  if (gui) gui.updateDisplay();
}

function loadScene() {
  icosphere = new Icosphere(vec3.fromValues(0, 0, 0), 1, controls.tesselations);
  icosphere.create();
  square = new Square(vec3.fromValues(0, 0, 0));
  square.create();
}

function main() {
  // Initial display for framerate
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.top = '0px';
  document.body.appendChild(stats.domElement);

  // Add controls to the gui
  gui.add(controls, 'tesselations', 0, 8).step(1);
  gui.add(controls, 'Load Scene');
  gui.add(controls, 'height', 0.1, 0.6).step(0.01);
  gui.add(controls, 'curl', 0.0, 1.0).step(0.01);
  gui.add(controls, 'temperature', 0.0, 1.0).step(0.01);

  gui.add(controls, 'Reset Defaults');

  // get canvas and webgl context
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  const gl = <WebGL2RenderingContext> canvas.getContext('webgl2');
  if (!gl) {
    alert('WebGL 2 not supported!');
  }
  // `setGL` is a function imported above which sets the value of `gl` in the `globals.ts` module.
  // Later, we can import `gl` from `globals.ts` to access it
  setGL(gl);

  // Initial call to load scene
  loadScene();

  const camera = new Camera(vec3.fromValues(0, 0, 5), vec3.fromValues(0, 0, 0));

  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(0.2, 0.2, 0.2, 1);
  gl.enable(gl.DEPTH_TEST);

  const lambert = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, lambertVertSource),
    new Shader(gl.FRAGMENT_SHADER, lambertFragSource),
  ]);

  const custom = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, customVertSource),
    new Shader(gl.FRAGMENT_SHADER, customFragSource),
  ]);

  const dither = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, ditherVertSource),
    new Shader(gl.FRAGMENT_SHADER, ditherFragSource),
  ]);

  const background = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, backgroundVertSource),
    new Shader(gl.FRAGMENT_SHADER, backgroundFragSource),
  ]);


  // This function will be called every frame
  function tick() {
    camera.update();
    stats.begin();
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();
    time++;
    if(controls.tesselations != prevTesselations)
    {
      prevTesselations = controls.tesselations;
      icosphere = new Icosphere(vec3.fromValues(0, 0, 0), 1, prevTesselations);
      icosphere.create();
    }
    if(controls.height != prevHeight)
    {
      prevHeight = controls.height;
    }
    if(controls.curl != prevCurl)
    {
      prevCurl = controls.curl;
    }
    if(controls.temperature != prevTemperature)
    {
      prevTemperature = controls.temperature;
    }
    renderer.renderBackground(camera, background, time, square);
    renderer.render(camera, dither, time, prevHeight, prevTemperature, prevCurl, [
      icosphere,
      // square,
    ]);
    stats.end();

    // Tell the browser to call `tick` again whenever it renders a new frame
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', function() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.setAspectRatio(window.innerWidth / window.innerHeight);
    camera.updateProjectionMatrix();
  }, false);

  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();

  // Start the render loop
  tick();
}

main();
