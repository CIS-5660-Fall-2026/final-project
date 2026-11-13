import {
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { bloom } from './bloom'
import { Flower } from './flower'
import { mulberry32 } from './random'
import { SIZE, terrain } from './terrain'

const params = {
  seed: 1,
  ridgeHeight: 1.2,
  facets: 28,
  flowers: 12,
  petals: 8,
  rings: 2,
  foldDepth: 0.9,
  fold: 0.4,
  newSeed: () => {
    params.seed = Math.floor(Math.random() * 10000)
    gui.controllersRecursive().forEach((c) => c.updateDisplay())
    generate()
  },
}

const renderer = new WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0x14246b)

const camera = new PerspectiveCamera(35, 1, 0.1, 100)
camera.position.set(10, 10, 21)
const controls = new OrbitControls(camera, renderer.domElement)
controls.maxPolarAngle = Math.PI / 2

const sun = new DirectionalLight(0xfff4e6, 3)
sun.position.set(-6, 12, 7)
sun.castShadow = true
sun.shadow.mapSize.set(4096, 4096)
sun.shadow.camera.left = sun.shadow.camera.bottom = -SIZE * 0.75
sun.shadow.camera.right = sun.shadow.camera.top = SIZE * 0.75
sun.shadow.camera.far = 40
sun.shadow.bias = -0.002
sun.shadow.normalBias = 0.05
sun.shadow.radius = 2
scene.add(sun, new HemisphereLight(0xdfe8ff, 0x2a48c8, 1.2))

const bluePaper = new MeshStandardMaterial({ color: 0x2b4fd6, flatShading: true, side: DoubleSide })
const whitePaper = new MeshStandardMaterial({ color: 0xf6f4ee, flatShading: true, side: DoubleSide })

const ground = new Mesh(undefined, bluePaper)
ground.castShadow = true
ground.receiveShadow = true
const flowers = new Group()
scene.add(ground, flowers)

let land: ReturnType<typeof terrain>

function generate() {
  land = terrain(params.seed, params.ridgeHeight, params.facets)
  ground.geometry.dispose()
  ground.geometry = land.geometry
  plantFlowers()
}

function plantFlowers() {
  flowers.children.forEach((flower) => (flower as Flower).geometry.dispose())
  flowers.clear()

  const pattern = bloom(params.petals, params.rings)
  const random = mulberry32(params.seed)
  for (let tries = 0; tries < 400 && flowers.children.length < params.flowers; tries++) {
    const x = (random() - 0.5) * (SIZE - 3)
    const z = (random() - 0.5) * (SIZE - 3)
    const size = 0.7 + 0.6 * random()
    const spin = random() * Math.PI * 2
    if (!isClear(x, z, size)) continue

    const flower = new Flower(pattern, whitePaper)
    flower.position.set(x, 0.01, z)
    flower.rotation.y = spin
    flower.scale.setScalar(size)
    flowers.add(flower)
  }
  foldFlowers()
}

// Flat ground under the whole sheet and no other flower touching it
function isClear(x: number, z: number, size: number): boolean {
  for (const reach of [size / 2, size]) {
    for (let k = 0; k < 12; k++) {
      const angle = (k / 12) * Math.PI * 2
      if (land.height(x + reach * Math.cos(angle), z + reach * Math.sin(angle)) > 0) return false
    }
  }
  return flowers.children.every((f) => Math.hypot(f.position.x - x, f.position.z - z) > size + f.scale.x)
}

function foldFlowers() {
  flowers.children.forEach((flower) => (flower as Flower).fold(params.fold * params.foldDepth))
}

const gui = new GUI()
gui.add(params, 'seed', 0, 9999, 1).onChange(generate)
gui.add(params, 'newSeed').name('new seed')
gui.add(params, 'ridgeHeight', 0, 3).name('ridge height').onChange(generate)
gui.add(params, 'facets', 8, 64, 1).onChange(generate)
gui.add(params, 'flowers', 0, 30, 1).onChange(plantFlowers)
gui.add(params, 'petals', 5, 12, 1).onFinishChange(plantFlowers)
gui.add(params, 'rings', 1, 3, 1).onFinishChange(plantFlowers)
gui.add(params, 'foldDepth', 0.1, 1).name('fold depth').onChange(foldFlowers)
gui.add(params, 'fold', 0, 1).onChange(foldFlowers)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

generate()
renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})
