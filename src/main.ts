import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {Line2} from 'three/examples/jsm/lines/Line2.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js';
import Stats from 'stats-js';
import GUI from 'lil-gui';

// NOTE: three's ShaderMaterial auto-declares these, so rename them in your GLSL:
//   vs_Pos -> position (vec3), vs_Nor -> normal, u_Model -> modelMatrix,
//   u_ViewProj -> projectionMatrix * viewMatrix, u_ModelInvTr -> normalMatrix (mat3)
import lambertVert from './shaders/lambert-vert.glsl?raw';
import lambertFrag from './shaders/lambert-frag.glsl?raw';

const SNAKE_SEGMENTS = 12;
const SEGMENT_RADIUS = 0.3;
const SEGMENT_SPACING = 0.7;
const RIBBON_POINTS = 40;

// ---- renderer, camera, stats -------------------------------------------
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x333333);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, 10);
const orbit = new OrbitControls(camera, canvas); // replaces your Camera.update()

const stats = Stats();
stats.setMode(0);
stats.domElement.style.position = 'absolute';
document.body.appendChild(stats.domElement);

// ---- uniforms: same idea as your Uniform classes ------------------------
// Plain {value} objects. Share the same object between materials and a change
// shows up everywhere; mutate `.value` and three uploads it for you.
const shared = {
  u_Wobble: {value: 0.045},
  u_Noise: {value: 1},
  u_Time: {value: 0},
};

const makeMaterial = (r: number, g: number, b: number) =>
  new THREE.ShaderMaterial({
    uniforms: {...shared, u_Color: {value: new THREE.Vector4(r, g, b, 1)}},
    vertexShader: lambertVert,
    fragmentShader: lambertFrag,
  });

// ---- ground plane --------------------------------------------------------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), makeMaterial(0.3, 0.5, 0.3));
ground.rotation.x = -Math.PI / 2; // PlaneGeometry faces +Z, so lay it flat
scene.add(ground);

// ---- chain of circles (one geometry shared by every mesh) ----------------
const circleGeo = new THREE.CircleGeometry(1, 32);
const snakeMat = makeMaterial(1, 0, 0);
for (let i = 0; i < SNAKE_SEGMENTS; i++) {
  const seg = new THREE.Mesh(circleGeo, snakeMat);
  seg.scale.set(SEGMENT_RADIUS, SEGMENT_RADIUS, 1);
  seg.position.set((i - SNAKE_SEGMENTS / 2) * SEGMENT_SPACING, SEGMENT_RADIUS, 0);
  scene.add(seg);
}

// ---- ribbon: dynamic BufferGeometry --------------------------------------
const ribbonPos = new Float32Array(RIBBON_POINTS * 2 * 3);
const ribbonNor = new Float32Array(RIBBON_POINTS * 2 * 3).map((_, i) => (i % 3 === 2 ? 1 : 0));
const ribbonIdx: number[] = [];
for (let i = 0; i < RIBBON_POINTS - 1; i++) {
  const a = 2 * i, b = 2 * i + 1, c = 2 * i + 2, d = 2 * i + 3;
  ribbonIdx.push(b, d, c, b, c, a);
}
const ribbonGeo = new THREE.BufferGeometry();
ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3).setUsage(THREE.DynamicDrawUsage));
ribbonGeo.setAttribute('normal', new THREE.BufferAttribute(ribbonNor, 3));
ribbonGeo.setIndex(ribbonIdx);

const ribbon = new THREE.Mesh(ribbonGeo, makeMaterial(0.9, 0.7, 0.2));
ribbon.position.set(0, 1.5, -1);
ribbon.frustumCulled = false; // bounds are stale while the vertices move
scene.add(ribbon);

function updateRibbon(t: number) {
  for (let i = 0; i < RIBBON_POINTS; i++) {
    const f = i / (RIBBON_POINTS - 1);
    const x = -4 + 8 * f;
    const y = 0.5 * Math.sin(x * 1.5 - t * 3);
    // Tangent from the analytic derivative; for an arbitrary path, average the neighbors instead
    const dx = 1, dy = 0.75 * Math.cos(x * 1.5 - t * 3);
    const len = Math.hypot(dx, dy);
    const half = 0.25 * (1 - 0.85 * f); // half-width with taper
    const nx = (-dy / len) * half, ny = (dx / len) * half;
    ribbonPos.set([x + nx, y + ny, 0, x - nx, y - ny, 0], i * 6);
  }
  ribbonGeo.attributes.position.needsUpdate = true;
}

// ---- thick line: Line2 from the examples folder --------------------------
const lineGeo = new LineGeometry();
lineGeo.setPositions([-4, 3, 0, 4, 3, 0]);
const lineMat = new LineMaterial({color: 0xffffff, linewidth: 0.08, worldUnits: true});
lineMat.resolution.set(window.innerWidth, window.innerHeight);
scene.add(new Line2(lineGeo, lineMat));

// ---- GUI ------------------------------------------------------------------
const gui = new GUI();
gui.add(shared.u_Wobble, 'value', 0, 0.5).name('wobble');
gui.add(shared.u_Noise, 'value', {Voronoi: 1, Worley: 2, Misc: 3}).name('noise');

// ---- loop + resize ----------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  stats.begin();
  shared.u_Time.value += clock.getDelta();
  updateRibbon(shared.u_Time.value);
  orbit.update();
  renderer.render(scene, camera);
  stats.end();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  lineMat.resolution.set(window.innerWidth, window.innerHeight);
});