import {vec3, vec4} from 'gl-matrix';
import Stats from 'stats-js';
import GUI from 'lil-gui';
import Square from './geometry/Square';

import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import Camera from './Camera';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import {FloatUniform, IntUniform} from './rendering/gl/Uniform';
import Scene from './Scene';

import lambertVertSource from './shaders/lambert-vert.glsl?raw';
import lambertFragSource from './shaders/lambert-frag.glsl?raw';

const SNAKE_SEGMENTS = 12;
const SEGMENT_RADIUS = 0.3;
const SEGMENT_SPACING = 0.7;

const controls = {
  color: vec4.fromValues(1.0, 0, 0, 1.0), // snake color
};

function main() {
  // Initial display for framerate
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.top = '0px';
  document.body.appendChild(stats.domElement);

  // get canvas and webgl context
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  const gl = <WebGL2RenderingContext> canvas.getContext('webgl2');
  if (!gl) {
    alert('WebGL 2 not supported!');
  }
  // Must happen before any Drawable/ShaderProgram is created: they read `gl` from globals.
  setGL(gl);

  const camera = new Camera(vec3.fromValues(0, 6, 10), vec3.fromValues(0, 0, 0));

  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(0.2, 0.2, 0.2, 1);
  gl.enable(gl.DEPTH_TEST);

  //backface culling
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);

  // Shader + its own uniforms. Keep the references; mutate `.value` any time.
  const wobble = new FloatUniform('u_Wobble', 0.045);
  const noise = new IntUniform('u_Noise', 1);
  const lambert = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, lambertVertSource),
    new Shader(gl.FRAGMENT_SHADER, lambertFragSource),
  ], [wobble, noise]);

  // Scene: big ground plane + a chain of small squares (snake placeholder)
  const scene = new Scene();

  const ground = new Square();
  ground.create();
  ground.setRotationEuler(0, -0.5, -0.1).setScale(50, 50, 1); // lay flat, 100x100 units
  ground.color = vec4.fromValues(0.3, 0.5, 0.3, 1);
  scene.add(ground, lambert);

  // One set of vertex buffers shared by every segment
  const segmentTemplate = new Square();
  segmentTemplate.create();

  const snake: Square[] = [];
  for (let i = 0; i < SNAKE_SEGMENTS; i++) {
    const seg = segmentTemplate.instance();
    seg.setScale(SEGMENT_RADIUS, SEGMENT_RADIUS, 1)
       .setPosition((i - SNAKE_SEGMENTS / 2) * SEGMENT_SPACING, SEGMENT_RADIUS, 0);
    vec4.copy(seg.color, controls.color);
    scene.add(seg, lambert);
    snake.push(seg);
  }

  // GUI binds straight to the uniform objects
  const gui = new GUI();
  gui.addColor(controls, 'color').listen().onChange(() => {
    for (const seg of snake) vec4.copy(seg.color, controls.color);
  });
  gui.add(wobble, 'value', 0, 0.5).name('wobble');
  gui.add(noise, 'value', {Voronoi : 1, Worley : 2, Misc : 3}).name('noise');

  let last = performance.now();

  // This function will be called every frame
  function tick(now: number) {
    const dt = Math.max(0, (now - last) / 1000);
    last = now;

    stats.begin();
    camera.update();
    scene.update(dt);

    gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.clear();
    scene.draw(camera);
    stats.end();

    // Tell the browser to call `tick` again whenever it renders a new frame
    requestAnimationFrame(tick);
  }

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.setAspectRatio(window.innerWidth / window.innerHeight);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize, false);
  resize();

  // Start the render loop
  requestAnimationFrame(tick);
}

main();
