import Drawable from '../rendering/gl/Drawable';
import {gl} from '../globals';

/**
 * A strip of constant (or tapered) width that follows a path, in the XY plane
 * facing +Z. Call setPoints() whenever the path changes (e.g. every frame
 * from update()); the vertex buffer is dynamic and re-uploaded in place.
 *
 * Path points are in the drawable's local space, so position/rotation/scale
 * still apply (rotate -90 about X to lay the ribbon flat on the ground).
 */
class Ribbon extends Drawable {
  /** Full width of the ribbon in local units. */
  width: number = 0.5;

  /** Width multiplier along the path: t = 0 at the first point, 1 at the last. */
  taper: (t: number) => number = () => 1;

  private maxPoints: number;
  private positions: Float32Array;

  constructor(maxPoints: number = 64) {
    super();
    this.maxPoints = maxPoints;
  }

  create() {
    const n = this.maxPoints;
    const verts = n * 2; // a left and right vertex per path point

    this.positions = new Float32Array(verts * 4);
    const normals = new Float32Array(verts * 4);
    for (let i = 0; i < verts; i++) {
      this.positions[i * 4 + 3] = 1; // w
      normals[i * 4 + 2] = 1;        // (0, 0, 1, 0)
    }

    // Point i owns vertices 2i (left) and 2i+1 (right). Two CCW triangles per segment.
    const indices = new Uint32Array((n - 1) * 6);
    for (let i = 0; i < n - 1; i++) {
      const a = 2 * i, b = 2 * i + 1, c = 2 * i + 2, d = 2 * i + 3;
      indices.set([b, d, c, b, c, a], i * 6);
    }

    this.generateIdx();
    this.generatePos();
    this.generateNor();

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNor);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.DYNAMIC_DRAW);

    this.count = 0; // nothing to draw until setPoints() is called
  }

  /**
   * @param points flat [x0, y0, x1, y1, ...] array (reuse one Float32Array to avoid garbage)
   * @param count  number of points to use (defaults to all of them, capped at maxPoints)
   *
   * Offsets use the averaged direction at each point, which is smooth for
   * gentle curves but will pinch at very sharp corners.
   */
  setPoints(points: ArrayLike<number>, count: number = points.length >> 1) {
    const n = Math.min(count, this.maxPoints);
    if (n < 2) {
      this.count = 0;
      return;
    }

    let tx = 1, ty = 0; // last good tangent, reused when neighbors coincide
    for (let i = 0; i < n; i++) {
      const prev = Math.max(i - 1, 0);
      const next = Math.min(i + 1, n - 1);
      const dx = points[2 * next] - points[2 * prev];
      const dy = points[2 * next + 1] - points[2 * prev + 1];
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) {
        tx = dx / len;
        ty = dy / len;
      }

      const half = 0.5 * this.width * this.taper(i / (n - 1));
      const nx = -ty * half; // left normal scaled to half width
      const ny = tx * half;
      const px = points[2 * i];
      const py = points[2 * i + 1];

      const o = i * 8;
      this.positions[o]     = px + nx;
      this.positions[o + 1] = py + ny;
      this.positions[o + 4] = px - nx;
      this.positions[o + 5] = py - ny;
    }

    this.bindPos();
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions, 0, n * 8);
    this.count = (n - 1) * 6;
  }
};

export default Ribbon;
