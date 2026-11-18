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
import * as DAT from 'dat.gui';
import ImageGuide from './field/ImageGuide';

const PAPER = [0.96, 0.94, 0.89];
const CELL_SIZE = 8;
const MAX_PARTICLES = 50000;
const IMAGE_MAX_SIZE = 512;

const defaultParams = {
  mode: 'Noise',
  edgeThreshold: 0.05,
  field: 'Curl',
  seed: 256,
  noiseScale: 512,
  octaves: 3,
  particleCount: 20000,
  speed: 120,
  alpha: 0.08,
  style: 'Ink',
  inkStrength: 1.0,
  paused: false,
};

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

  const accum = new Accumulator();
  let field: FlowField;
  let particles: Particles;
  let guide: ImageGuide = null;
  let saveRequested = false;

  const imageInput = <HTMLInputElement> document.getElementById('imageInput');

  const controls = {
    ...defaultParams,
    'Load Image': () => {
      imageInput.click();
    },
    'Clear': () => {
      accum.clear();
    },
    'New Seed': () => {
      controls.seed = Math.floor(Math.random() * 1000);
      restart();
      guiControllers.forEach(c => c.updateDisplay());
    },
    'Save PNG': () => {
      saveRequested = true;
    },
    'Reset': () => {
      Object.assign(controls, defaultParams);
      restart();
      guiControllers.forEach(c => c.updateDisplay());
    },
  };

  function restart() {
    setNoiseSeed(controls.seed);
    const type = controls.field === 'Curl' ? FIELD_CURL : FIELD_PERLIN;
    field = new FlowField(canvas.width, canvas.height, CELL_SIZE);
    field.build(type, controls.noiseScale, controls.octaves, 0.0);

    let activeGuide: ImageGuide = null;
    if (controls.mode === 'Image' && guide) {
      guide.fitTo(canvas.width, canvas.height);
      field.applyImage(guide, controls.edgeThreshold);
      activeGuide = guide;
    }
    particles = new Particles(controls.particleCount, canvas.width, canvas.height, activeGuide);
    accum.clear();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(Math.floor(window.innerWidth * dpr),
                     Math.floor(window.innerHeight * dpr));
    accum.resize(canvas.width, canvas.height);
    restart();
  }
  window.addEventListener('resize', resize);
  resize();

  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      guide = new ImageGuide(img, IMAGE_MAX_SIZE);
      URL.revokeObjectURL(img.src);
      controls.mode = 'Image';
      restart();
      guiControllers.forEach(c => c.updateDisplay());
    };
    img.src = URL.createObjectURL(file);
    imageInput.value = '';
  });

  const gui = new DAT.GUI();

  const guiControllers = [
    gui.add(controls, 'mode', ['Noise', 'Image']).onFinishChange(restart),

    gui.add(controls, 'edgeThreshold', 0.005, 0.3).step(0.005).onFinishChange(restart),

    gui.add(controls, 'field', ['Curl', 'Perlin']).onFinishChange(restart),

    gui.add(controls, 'seed', 0, 1000).step(1).onFinishChange(restart),

    gui.add(controls, 'noiseScale', 10, 6000).step(10).onFinishChange(restart),

    gui.add(controls, 'octaves', 1, 6).step(1).onFinishChange(restart),

    gui.add(controls, 'particleCount', 1000, MAX_PARTICLES).step(1000).onFinishChange(restart),

    gui.add(controls, 'speed', 20, 400),

    gui.add(controls, 'alpha', 0.01, 0.3).step(0.01),

    gui.add(controls, 'style', ['Ink', 'Glow']),

    gui.add(controls, 'inkStrength', 0.2, 3.0).step(0.05),

    gui.add(controls, 'paused'),
  ];
  gui.add(controls, 'Load Image');
  gui.add(controls, 'Clear');
  gui.add(controls, 'New Seed');
  gui.add(controls, 'Save PNG');
  gui.add(controls, 'Reset');

  
  const lineProg = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, lineVertSrc),
    new Shader(gl.FRAGMENT_SHADER, lineFragSrc),
  ]);
  const compositeProg = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, screenVertSrc),
    new Shader(gl.FRAGMENT_SHADER, compositeFragSrc),
  ]);

  const batch = new LineBatch(MAX_PARTICLES);
  const screenQuad = new Square(vec3.fromValues(0, 0, 0));
  screenQuad.create();

  let prev = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;

    stats.begin();

    if (!controls.paused) {
      particles.step(field, controls.speed, dt, controls.alpha, batch);
      accum.bind();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      lineProg.setResolution(accum.width, accum.height);
      batch.draw();
      gl.disable(gl.BLEND);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accum.texture);
    compositeProg.setAccum(0);
    compositeProg.setPaper(PAPER[0], PAPER[1], PAPER[2]);
    compositeProg.setInkStrength(controls.inkStrength);
    compositeProg.setMode(controls.style === 'Ink' ? 0 : 1);
    compositeProg.draw(screenQuad);

    if (saveRequested) {
      saveRequested = false;
      const link = document.createElement('a');
      link.download = 'flow-field-' + controls.seed + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    stats.end();
    requestAnimationFrame(tick);
  }
  tick();
}

main();
