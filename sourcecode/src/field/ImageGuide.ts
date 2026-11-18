class ImageGuide {
  width: number;
  height: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  dirX: Float32Array;
  dirY: Float32Array;
  strength: Float32Array;
  scale: number = 1.0;
  offsetX: number = 0.0;
  offsetY: number = 0.0;

  constructor(img: HTMLImageElement, maxSize: number) {
    const s = Math.min(1.0, maxSize / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * s));
    const h = Math.max(1, Math.round(img.height * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;

    this.width = w;
    this.height = h;
    const n = w * h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.r[i] = pixels[i * 4] / 255;
      this.g[i] = pixels[i * 4 + 1] / 255;
      this.b[i] = pixels[i * 4 + 2] / 255;
      gray[i] = 0.299 * this.r[i] + 0.587 * this.g[i] + 0.114 * this.b[i];
    }

    const blurred = boxBlur(boxBlur(gray, w, h, 2), w, h, 2);

    this.dirX = new Float32Array(n);
    this.dirY = new Float32Array(n);
    this.strength = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xl = Math.max(x - 1, 0);
        const xr = Math.min(x + 1, w - 1);
        const yu = Math.max(y - 1, 0);
        const yd = Math.min(y + 1, h - 1);

        const tl = blurred[yu * w + xl];
        const tm = blurred[yu * w + x];
        const tr = blurred[yu * w + xr];
        const ml = blurred[y * w + xl];
        const mr = blurred[y * w + xr];
        const bl = blurred[yd * w + xl];
        const bm = blurred[yd * w + x];
        const br = blurred[yd * w + xr];

        const gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
        const gy = (bl + 2.0 * bm + br) - (tl + 2.0 * tm + tr);
        const mag = Math.sqrt(gx * gx + gy * gy);

        const k = y * w + x;
        this.strength[k] = mag / 4.0;
        this.dirX[k] = -gy / (mag + 1e-8);
        this.dirY[k] = gx / (mag + 1e-8);
      }
    }
  }

  fitTo(canvasW: number, canvasH: number) {
    this.scale = Math.max(canvasW / this.width, canvasH / this.height);
    this.offsetX = (canvasW - this.width * this.scale) * 0.5;
    this.offsetY = (canvasH - this.height * this.scale) * 0.5;
  }

  indexAt(x: number, y: number): number {
    let ix = Math.floor((x - this.offsetX) / this.scale);
    let iy = Math.floor((y - this.offsetY) / this.scale);
    ix = Math.min(Math.max(ix, 0), this.width - 1);
    iy = Math.min(Math.max(iy, 0), this.height - 1);
    return iy * this.width + ix;
  }
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0.0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(Math.max(x + k, 0), w - 1);
        sum += src[y * w + xx];
      }
      tmp[y * w + x] = sum / (2 * radius + 1);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0.0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(Math.max(y + k, 0), h - 1);
        sum += tmp[yy * w + x];
      }
      dst[y * w + x] = sum / (2 * radius + 1);
    }
  }
  return dst;
}

export default ImageGuide;