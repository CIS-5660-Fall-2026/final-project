import {vec3, mat4} from 'gl-matrix';
import Stats from 'stats-js';
import * as DAT from 'dat.gui';
import Icosphere from './geometry/Icosphere';
import Square from './geometry/Square';
import Cube from './geometry/Cube';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import Camera from './Camera';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';

import lambertVertSource from './shaders/lambert-vert.glsl?raw';
import lambertFragSource from './shaders/lambert-frag.glsl?raw';

import skyboxVertSource from './shaders/skybox-vert.glsl?raw';
import skyboxFragSource from './shaders/skybox-frag.glsl?raw';

// Define an object with application parameters and button callbacks
// This will be referred to by dat.GUI's functions that add GUI elements.
const controls = {
  tesselations: 5,
  'Load Scene': loadScene, // A function pointer, essentially
  'Reset Fireball': resetFireball,
  Base: [140, 153, 217],
  Variation: [77, 64, 26],
  Frequency: [204, 230, 255],
  Phase: [217, 230, 242],
  Tail: 1,
  Speed: 1,
  Length: 5,
  ColorWave: 0,
  CometSpeed: 50,
  Scale: 50.0
};

let controllers: DAT.GUIController[] = [];

function resetFireball() {
  controls.tesselations = 5;
  controls.Base = [140, 153, 217];
  controls.Variation = [77, 64, 26];
  controls.Frequency = [204, 230, 255];
  controls.Phase = [217, 230, 242];
  controls.Tail = 1;
  controls.Speed = 1;
  controls.Length = 5;
  controls.ColorWave = 0;
  controls.CometSpeed = 0.5,
  controls.Scale = 50.0

  for(let controller of controllers){
    controller.updateDisplay();
  }
}

let icosphere: Icosphere;
let skybox: Icosphere;
let square: Square;
let prevTesselations: number = 5;
let cube: Cube;

const cometFront = vec3.normalize(vec3.create(), vec3.fromValues(1, -0.15, 0));
const cometStart = vec3.fromValues(-250, 175, -300);
let cometPos = vec3.clone(cometStart);

function loadScene() {
  icosphere = new Icosphere(vec3.fromValues(0, 0, 0), 1, controls.tesselations);
  icosphere.create();
  skybox = new Icosphere(vec3.fromValues(0,0,0), 5000, 5);
  skybox.create();
  // square = new Square(vec3.fromValues(0, 0, 0));
  // square.create();
  // cube = new Cube(vec3.fromValues(0,0,0));
  // cube.create();
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
  const gui = new DAT.GUI();
  controllers.push(gui.add(controls, 'tesselations', 0, 8).step(1));
  controllers.push(gui.addColor(controls, 'Base'));
  controllers.push(gui.addColor(controls, 'Variation'));
  controllers.push(gui.addColor(controls, 'Frequency'));
  controllers.push(gui.addColor(controls, 'Phase'));
  controllers.push(gui.add(controls, 'Tail', -0.95, 2.95).step(0.05));
  controllers.push(gui.add(controls, 'Speed', -10, 10).step(0.05));
  controllers.push(gui.add(controls, 'Length', -20, 20).step(0.1));
  controllers.push(gui.add(controls, 'ColorWave', 0, 0.2).step(0.01));
  gui.add(controls, 'Reset Fireball');
  gui.add(controls, 'CometSpeed', 0, 5).step(0.05);
  gui.add(controls, 'Scale', 0.01, 1).step(0.01);


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

  const camera = new Camera(vec3.fromValues(0, 0, 1), vec3.fromValues(0, 0, 0));

  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(0.0, 0.0, 0.0, 1);
  gl.enable(gl.DEPTH_TEST);

  const lambert = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, lambertVertSource),
    new Shader(gl.FRAGMENT_SHADER, lambertFragSource),
  ]);

  const skyShader = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, skyboxVertSource),
    new Shader(gl.FRAGMENT_SHADER, skyboxFragSource),
  ])

  let time = 0;
  let lastTime = performance.now();

  // This function will be called every frame
  function tick() {
    time++;
    camera.update();
    stats.begin();
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();
    if(controls.tesselations != prevTesselations)
    {
      prevTesselations = controls.tesselations;
      icosphere = new Icosphere(vec3.fromValues(0, 0, 0), 1, prevTesselations);
      icosphere.create();
    }
    
    // Skybox
    skyShader.setTime(time);

    renderer.renderSkybox(
      camera,
      skyShader,
      skybox
    );


    // Fireball
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    vec3.scaleAndAdd(cometPos, cometPos, cometFront, controls.CometSpeed * dt);
    if (vec3.distance(cometPos, cometStart) > 1000){
      vec3.copy(cometPos, cometStart);
    }

    const model = mat4.create();
    mat4.translate(model, model, cometPos);
    mat4.scale(model, model, [controls.Scale, controls.Scale, controls.Scale]);

    lambert.setTime(time);
    lambert.setTailDir(vec3.negate(vec3.create(), cometFront));

    renderer.render(camera, lambert, model, 
      vec3.fromValues(controls.Base[0], controls.Base[1], controls.Base[2]),
      vec3.fromValues(controls.Variation[0], controls.Variation[1], controls.Variation[2]),
      vec3.fromValues(controls.Frequency[0], controls.Frequency[1], controls.Frequency[2]),
      vec3.fromValues(controls.Phase[0], controls.Phase[1], controls.Phase[2]),
      controls.Tail,
      controls.Speed,
      controls.Length,
      controls.ColorWave,
      [
      icosphere,
      //skybox,
      //square
      //cube,
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
