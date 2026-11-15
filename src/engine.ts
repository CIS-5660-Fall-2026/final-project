import * as THREE from 'three';

const VIEW_HEIGHT = 10; 

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
export const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x1a1c1f);

export const scene = new THREE.Scene();

export const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.z = 10; 

export const mouse = new THREE.Vector3();
canvas.addEventListener('mousemove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1, 0)
       .unproject(camera);
});

function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-VIEW_HEIGHT * aspect) / 2;
  camera.right = (VIEW_HEIGHT * aspect) / 2;
  camera.top = VIEW_HEIGHT / 2;
  camera.bottom = -VIEW_HEIGHT / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

export const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});