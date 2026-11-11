import FlowField from '../field/FlowField';
import LineBatch from '../rendering/gl/LineBatch';

const INKS = [
  [0.07, 0.08, 0.09],
  [0.10, 0.14, 0.32],
  [0.45, 0.18, 0.10],
];

class Particles {
  count: number;
  width: number;
  height: number;
  x: Float32Array;
  y: Float32Array;
  age: Float32Array;
  life: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  vel: Float32Array = new Float32Array(2);

  constructor(count: number, width: number, height: number) {
    this.count = count;
    this.width = width;
    this.height = height;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.age = new Float32Array(count);
    this.life = new Float32Array(count);
    this.r = new Float32Array(count);
    this.g = new Float32Array(count);
    this.b = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.respawn(i);
    }
  }

  respawn(i: number) {
    this.x[i] = Math.random() * this.width;
    this.y[i] = Math.random() * this.height;
    this.age[i] = 0.0;
    this.life[i] = 2.0 + Math.random() * 4.0;

    const p = Math.random();
    const ink = p < 0.2 ? INKS[0] : (p < 0.7 ? INKS[1] : INKS[2]);
    this.r[i] = ink[0];
    this.g[i] = ink[1];
    this.b[i] = ink[2];
  }

  step(field: FlowField, speed: number, dt: number, alpha: number, batch: LineBatch) {
    batch.clear();
    for (let i = 0; i < this.count; i++) {
      const x0 = this.x[i];
      const y0 = this.y[i];
      field.sample(x0, y0, this.vel);
      const x1 = x0 + this.vel[0] * speed * dt;
      const y1 = y0 + this.vel[1] * speed * dt;
      this.age[i] += dt;

      if (x1 < 0 || x1 >= this.width || y1 < 0 || y1 >= this.height || this.age[i] > this.life[i]) {
        this.respawn(i);
        continue;
      }
      batch.push(x0, y0, x1, y1, this.r[i], this.g[i], this.b[i], alpha);
      this.x[i] = x1;
      this.y[i] = y1;
    }
  }
}
export default Particles;
