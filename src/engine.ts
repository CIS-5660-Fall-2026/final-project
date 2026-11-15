import * as THREE from 'three';

const VIEW_HEIGHT = 10;

type UpdateFn = (dt: number) => void;

export class Engine {
  readonly canvas = document.getElementById('canvas') as HTMLCanvasElement;
  readonly renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  readonly mouse = new THREE.Vector3();
  readonly clock = new THREE.Clock();
  private updaters = new Set<UpdateFn>();

  constructor() {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x1a1c1f);

    this.camera.position.z = 10;

    this.canvas.addEventListener('mousemove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1, 0)
                .unproject(this.camera);
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  onUpdate(fn: UpdateFn): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  offUpdate(fn: UpdateFn) {
    this.updaters.delete(fn);
  }

  resize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.left = (-VIEW_HEIGHT * aspect) / 2;
    this.camera.right = (VIEW_HEIGHT * aspect) / 2;
    this.camera.top = VIEW_HEIGHT / 2;
    this.camera.bottom = -VIEW_HEIGHT / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const dt = this.clock.getDelta();
      for (const fn of this.updaters) fn(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }
}