import Stats from 'stats-js';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import LineBatch from './rendering/gl/LineBatch';
import lineVertSrc from './shaders/line-vert.glsl?raw';
import lineFragSrc from './shaders/line-frag.glsl?raw';

const PAPER = [0.96, 0.94, 0.89];


function fillTestLines(batch: LineBatch, w: number, h: number) {
  batch.clear();
  for (let i = 0; i < 3000; i++) {
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

  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(PAPER[0], PAPER[1], PAPER[2], 1);
  gl.disable(gl.DEPTH_TEST);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(Math.floor(window.innerWidth * dpr),
                     Math.floor(window.innerHeight * dpr));
  }
  window.addEventListener('resize', resize);
  resize();

  const lineProg = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, lineVertSrc),
    new Shader(gl.FRAGMENT_SHADER, lineFragSrc),
  ]);
  const batch = new LineBatch(10000);
  fillTestLines(batch, canvas.width, canvas.height);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let prev = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;

    stats.begin();
    gl.viewport(0, 0, canvas.width, canvas.height);
    renderer.clear();
    lineProg.setResolution(canvas.width, canvas.height);
    batch.draw();

    stats.end();
    requestAnimationFrame(tick);
  }
  tick();
}

main();
