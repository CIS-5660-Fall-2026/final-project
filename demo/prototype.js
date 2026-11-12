import * as THREE from './vendor/three.module.js';
import { generate, groundHeight, PRESETS } from './track.js';

const view = document.getElementById('view');
const status = document.getElementById('status');
const preset = document.getElementById('preset');
const cameraButton = document.getElementById('camera');

for (const [key, settings] of Object.entries(PRESETS)) {
  preset.add(new Option(settings.label, key));
}

function buildTerrain(track, radius) {
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2, 120, 120);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const coast = THREE.MathUtils.smoothstep(Math.hypot(x, z) / radius, 0.85, 0.99);
    positions.setY(i, THREE.MathUtils.lerp(groundHeight(x, z, track), -8, coast));
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x9a9a9a,
      flatShading: true,
    })
  );
}

function buildRoad(track) {
  const positions = [];
  const indices = [];
  track.frames.forEach(({ p, n }, i) => {
    for (const sign of [-1, 1]) {
      const edge = p.clone().addScaledVector(n, (sign * track.width) / 2);
      positions.push(edge.x, edge.y + 0.3, edge.z);
    }
    const a = 2 * i;
    const b = 2 * ((i + 1) % track.frames.length);
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x333333,
      side: THREE.DoubleSide,
    })
  );
}

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xdddddd);
  view.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.4));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(-350, 600, 250);
  scene.add(light);

  let circuit;
  let terrain;
  let radius;
  let showTerrain = false;

  function draw() {
    if (!circuit) {
      return;
    }
    const { clientWidth: width, clientHeight: height } = view;
    if (!width || !height) {
      return;
    }
    const halfHeight = radius * 1.1 * Math.max(1, height / width);
    const halfWidth = (halfHeight * width) / height;
    Object.assign(camera, {
      left: -halfWidth,
      right: halfWidth,
      top: halfHeight,
      bottom: -halfHeight,
      near: 1,
      far: radius * 8,
    });
    if (showTerrain) {
      camera.up.set(0, 1, 0);
      camera.position.set(radius * 1.5, radius * 1.3, radius * 1.7);
    } else {
      camera.up.set(0, 0, -1);
      camera.position.set(0, radius * 3, 0);
    }
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    terrain.visible = showTerrain;
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = width + 'px';
    renderer.domElement.style.height = height + 'px';
    renderer.render(scene, camera);
  }

  function regenerate(event) {
    event?.preventDefault();
    try {
      const seed = document.getElementById('seed').value.trim() || '0';
      const track = generate({ ...PRESETS[preset.value], style: preset.value, seed });
      const nextRadius = Math.max(...track.points.map((p) => Math.hypot(p.x, p.z))) / 0.8 + 25;
      const next = new THREE.Group();
      const nextTerrain = buildTerrain(track, nextRadius);
      next.add(nextTerrain, buildRoad(track));

      const lifted = (points) => points.map((p) => p.clone().add(new THREE.Vector3(0, 1, 0)));
      const centerline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(lifted(track.points)),
        new THREE.LineBasicMaterial({ color: 0xffce4d })
      );
      const controls = new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(lifted(track.controls)),
        new THREE.PointsMaterial({ color: 0xdd542d, size: 5, sizeAttenuation: false })
      );
      next.add(centerline, controls);

      if (circuit) {
        scene.remove(circuit);
        circuit.traverse((object) => {
          object.geometry?.dispose();
          object.material?.dispose();
        });
      }
      circuit = next;
      terrain = nextTerrain;
      radius = nextRadius;
      scene.add(circuit);
      status.textContent = `Seed ${seed} · ${Math.round(track.length)} m · max grade ${(track.maxGrade * 100).toFixed(1)}%${track.fallback ? ' · oval fallback' : ''}`;
      draw();
    } catch (error) {
      status.textContent = error.message;
    }
  }

  document.getElementById('controls').addEventListener('submit', regenerate);
  cameraButton.addEventListener('click', () => {
    showTerrain = !showTerrain;
    cameraButton.textContent = showTerrain ? 'Show top-down' : 'Show 3D terrain';
    draw();
  });
  new ResizeObserver(draw).observe(view);
  regenerate();
}

try {
  start();
} catch (error) {
  status.textContent = 'Could not start WebGL. ' + error.message;
}
