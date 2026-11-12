import {vec3} from 'gl-matrix';
import Drawable from '../rendering/gl/Drawable';
import {gl} from '../globals';

/**
 * Unit quad spanning [-1, 1] in X and Y, facing +Z.
 * Position/rotation/scale come from Drawable, so scale it up for a ground plane
 * (rotate -90 deg about X to lay it flat) or down for a snake segment.
 */
class Square extends Drawable {
  indices: Uint32Array;
  positions: Float32Array;
  normals: Float32Array;

  constructor(center: vec3 = vec3.create()) {
    super();
    vec3.copy(this.position, center);
  }

  create() {
    this.indices = new Uint32Array([0, 1, 2,
                                    0, 2, 3]);
    this.normals = new Float32Array([0, 0, 1, 0,
                                     0, 0, 1, 0,
                                     0, 0, 1, 0,
                                     0, 0, 1, 0]);
    this.positions = new Float32Array([-1, -1, 0, 1,
                                        1, -1, 0, 1,
                                        1,  1, 0, 1,
                                       -1,  1, 0, 1]);

    this.generateIdx();
    this.generatePos();
    this.generateNor();

    this.count = this.indices.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNor);
    gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
  }

  /** A new Square with its own transform/color that shares this one's GPU buffers. */
  instance(): Square {
    const s = new Square();
    s.shareBuffersFrom(this);
    return s;
  }
};

export default Square;
