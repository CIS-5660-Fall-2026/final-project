import {vec3} from 'gl-matrix';
import Stats from 'stats-js';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import LineBatch from './rendering/gl/LineBatch';
import Accumulator from './rendering/gl/Accumulator';
import Square from './geometry/Square';
import FlowField, {FIELD_PERLIN, FIELD_CURL} from './field/FlowField';
import Particles from './sim/Particles';
import {setNoiseSeed} from './noise/perlin';
import lineVertSrc from './shaders/line-vert.glsl?raw';
import lineFragSrc from './shaders/line-frag.glsl?raw';
import screenVertSrc from './shaders/screen-vert.glsl?raw';
import compositeFragSrc from './shaders/composite-frag.glsl?raw';

const PAPER = [0.96, 0.94, 0.89];
const INK_STRENGTH = 1.0;
const RENDER_MODE = 0;

const SEED = 256;
const FIELD_TYPE = FIELD_CURL;
const NOISE_SCALE = 0.0015;
const OCTAVES = 3;
const CELL_SIZE = 8;
const PARTICLE_COUNT = 20000;
const SPEED = 120;
const ALPHA = 0.08;

function main() {
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.top = '0px';
  document.body.appendChild(stats.domElement);

  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  const gl = <WebGL2RenderingContext> canvas.getContext('webgl2');
  if (!gl) { alert('WebGL 2 not supported!'); return; }
  setGL(gl);
  if (!gl.getExtension('EXT_color_buffer_float')) {
    alert('EXT_color_buffer_float not supported!');
    return;
  }

  const renderer = new OpenGLRenderer(canvas);
  gl.disable(gl.DEPTH_TEST);

  setNoiseSeed(SEED);
  const accum = new Accumulator();
  let field: FlowField;
  let particles: Particles;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(Math.floor(window.innerWidth * dpr),
                     Math.floor(window.innerHeight * dpr));
    accum.resize(canvas.width, canvas.height);
    field = new FlowField(canvas.width, canvas.height, CELL_SIZE);
    field.build(FIELD_TYPE, NOISE_SCALE, OCTAVES, 0.0);
    particles = new Particles(PARTICLE_COUNT, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  const lineProg = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, lineVertSrc),
    new Shader(gl.FRAGMENT_SHADER, lineFragSrc),
  ]);
  const compositeProg = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, screenVertSrc),
    new Shader(gl.FRAGMENT_SHADER, compositeFragSrc),
  ]);

  const batch = new LineBatch(PARTICLE_COUNT);
  const screenQuad = new Square(vec3.fromValues(0, 0, 0));
  screenQuad.create();

  let prev = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;

    stats.begin();

    particles.step(field, SPEED, dt, ALPHA, batch);
    accum.bind();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    lineProg.setResolution(accum.width, accum.height);
    batch.draw();
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accum.texture);
    compositeProg.setAccum(0);
    compositeProg.setPaper(PAPER[0], PAPER[1], PAPER[2]);
    compositeProg.setInkStrength(INK_STRENGTH);
    compositeProg.setMode(RENDER_MODE);
    compositeProg.draw(screenQuad);

    stats.end();
    requestAnimationFrame(tick);
  }
  tick();
}

main();
