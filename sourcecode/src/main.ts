import {vec3} from 'gl-matrix';
import Stats from 'stats-js';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import LineBatch from './rendering/gl/LineBatch';
import Accumulator from './rendering/gl/Accumulator';
import Square from './geometry/Square';
import lineVertSrc from './shaders/line-vert.glsl?raw';
import lineFragSrc from './shaders/line-frag.glsl?raw';
import screenVertSrc from './shaders/screen-vert.glsl?raw';
import compositeFragSrc from './shaders/composite-frag.glsl?raw';

const PAPER = [0.96, 0.94, 0.89];
const INK_STRENGTH = 1.0;
const RENDER_MODE = 0;


function addTestLines(batch: LineBatch, w: number, h: number, count: number) {
  batch.clear();
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const ang = Math.random() * Math.PI * 2, len = 20 + Math.random() * 80;
    batch.push(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len,
               0.1, 0.1, 0.15, 0.4);
  }
}


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

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(Math.floor(window.innerWidth * dpr),
                     Math.floor(window.innerHeight * dpr));
    accum.resize(canvas.width, canvas.height);
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

  const batch = new LineBatch(10000);
  const screenQuad = new Square(vec3.fromValues(0, 0, 0));
  screenQuad.create();

  let prev = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;

    stats.begin();

    addTestLines(batch, canvas.width, canvas.height, 200);
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
