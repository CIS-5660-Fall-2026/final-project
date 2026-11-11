import Drawable from '../rendering/gl/Drawable';
import {gl} from '../globals';

/**
 * Unit-radius disc in the XY plane facing +Z, built as a triangle fan.
 * Use setScale(r, r, 1) for a radius of r.
 */
class Circle extends Drawable {
  segments: number;

  constructor(segments: number = 32) {
    super();
    this.segments = segments;
  }

  create() {
    const n = this.segments;

    // Vertex 0 is the center, vertices 1..n are the rim (counter-clockwise from +X)
    const positions = new Float32Array((n + 1) * 4);
    const normals = new Float32Array((n + 1) * 4);
    positions.set([0, 0, 0, 1], 0);
    normals.set([0, 0, 1, 0], 0);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      positions.set([Math.cos(a), Math.sin(a), 0, 1], (i + 1) * 4);
      normals.set([0, 0, 1, 0], (i + 1) * 4);
    }

    const indices = new Uint32Array(n * 3);
    for (let i = 0; i < n; i++) {
      indices.set([0, 1 + i, 1 + ((i + 1) % n)], i * 3);
    }

    this.generateIdx();
    this.generatePos();
    this.generateNor();

    this.count = indices.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNor);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  }

  /** A new Circle with its own transform/color that shares this one's GPU buffers. */
  instance(): Circle {
    const c = new Circle(this.segments);
    c.shareBuffersFrom(this);
    return c;
  }
};

export default Circle;
