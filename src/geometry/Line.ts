import {vec3, quat} from 'gl-matrix';
import Square from './Square';

/**
 * A straight line with thickness between two points. It's a Square stretched
 * and rotated into place, so it reuses Square's geometry and needs no
 * buffer updates when the endpoints or thickness change.
 */
class Line extends Square {
  thickness: number;

  constructor(thickness: number = 0.1) {
    super();
    this.thickness = thickness;
  }

  /**
   * 'xy' (default): the line faces +Z and uses the endpoints' x/y, z is averaged.
   * 'xz': the line lies flat facing +Y and uses x/z, y is averaged (for lines on the ground;
   *       lift it a little above the ground plane to avoid z-fighting).
   */
  setEndpoints(a: vec3, b: vec3, plane: 'xy' | 'xz' = 'xy', thickness: number = this.thickness): this {
    this.thickness = thickness;
    vec3.lerp(this.position, a, b, 0.5);

    const dx = b[0] - a[0];
    quat.identity(this.rotation);

    if (plane === 'xy') {
      const dy = b[1] - a[1];
      quat.rotateZ(this.rotation, this.rotation, Math.atan2(dy, dx));
      vec3.set(this.scale, Math.hypot(dx, dy) / 2, thickness / 2, 1);
    } else {
      const dz = b[2] - a[2];
      // Lay the quad flat first, then spin it about Y so its length follows the line
      quat.rotateY(this.rotation, this.rotation, Math.atan2(-dz, dx));
      quat.rotateX(this.rotation, this.rotation, -Math.PI / 2);
      vec3.set(this.scale, Math.hypot(dx, dz) / 2, thickness / 2, 1);
    }
    return this;
  }

  instance(): Line {
    const l = new Line(this.thickness);
    l.shareBuffersFrom(this);
    return l;
  }
};

export default Line;
