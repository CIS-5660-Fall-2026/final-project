import {fbmPerlin3D} from '../noise/perlin';

export const FIELD_PERLIN = 0;
export const FIELD_CURL = 1;

class FlowField {
  cellSize: number;
  cols: number;
  rows: number;
  vx: Float32Array;
  vy: Float32Array;

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width /cellSize) + 1;
    this.rows = Math.ceil(height / cellSize) + 1;
    this.vx = new Float32Array(this.cols * this.rows);
    this.vy = new Float32Array(this.cols * this.rows);
  }

  build(type: number, noiseScale: number, octaves: number, time: number) {
    const cols = this.cols;
    const rows = this.rows;

    const n = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const nx = i * this.cellSize * noiseScale;
        const ny = j * this.cellSize * noiseScale;
        n[j * cols + i] = fbmPerlin3D(nx, ny, time, octaves, 2.0, 0.5);
      }
    }

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        let dx = 0.0;
        let dy = 0.0;
        if (type === FIELD_PERLIN) {
          const angle = n[k] * Math.PI * 2.0;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
        } else {
          const iL = Math.max(i - 1, 0);
          const iR = Math.min(i + 1, cols - 1);
          const jU = Math.max(j - 1, 0);
          const jD = Math.min(j + 1, rows - 1);
          const dndx = (n[j * cols + iR] - n[j * cols + iL]) / (iR - iL);
          const dndy = (n[jD * cols + i] - n[jU * cols + i]) / (jD - jU);
          dx = dndy;
          dy = -dndx;
        }
        const len = Math.sqrt(dx * dx + dy * dy) + 1e-8;
        this.vx[k] = dx / len;
        this.vy[k] = dy / len;
      }
    }
  }

  sample(x: number, y: number, out: Float32Array) {
    const gx = x / this.cellSize;
    const gy = y / this.cellSize;
    const i0 = Math.min(Math.max(Math.floor(gx), 0), this.cols - 2);
    const j0 = Math.min(Math.max(Math.floor(gy), 0), this.rows - 2);
    const tx = gx - i0;
    const ty = gy - j0;

    const k00 = j0 * this.cols + i0;
    const k10 = k00 + 1;
    const k01 = k00 + this.cols;
    const k11 = k01 + 1;

    out[0] = (this.vx[k00] *(1 - tx) +this.vx[k10] * tx) * (1 - ty)+ (this.vx[k01] * (1 - tx) +this.vx[k11] * tx) * ty;
    out[1] = (this.vy[k00] * (1 - tx) + this.vy[k10] * tx) * (1 - ty)+ (this.vy[k01] * (1 - tx) + this.vy[k11] * tx) * ty;
  }
}

export default FlowField;