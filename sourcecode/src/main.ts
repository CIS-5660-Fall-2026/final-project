import Stats from 'stats-js';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import {setGL} from './globals';

const PAPER = [0.96, 0.94, 0.89];

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

  let prev = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;

    stats.begin();
    gl.viewport(0, 0, canvas.width, canvas.height);
    renderer.clear();
    stats.end();
    requestAnimationFrame(tick);
  }
  tick();
}

main();
