import {vec3, vec4, mat4} from 'gl-matrix';
import {gl} from '../../globals';

/**
 * A named uniform with a value. Create one, hand it to a ShaderProgram, and
 * mutate `.value` whenever you like; the program uploads it before drawing.
 *
 * Each instance is linked to ONE program (the location is per-program), so
 * make a new instance for each shader that needs the uniform.
 */
export abstract class Uniform<T> {
  private loc: WebGLUniformLocation | null = null;

  constructor(readonly name: string, public value: T) {}

  /** Called by ShaderProgram after linking. Returns false if the shader has no such uniform. */
  link(prog: WebGLProgram): boolean {
    this.loc = gl.getUniformLocation(prog, this.name);
    return this.loc !== null;
  }

  /** The owning program must already be in use. */
  upload(): void {
    if (this.loc !== null) this.write(this.loc);
  }

  protected abstract write(loc: WebGLUniformLocation): void;
}

export class FloatUniform extends Uniform<number> {
  protected write(loc: WebGLUniformLocation) { gl.uniform1f(loc, this.value); }
}

export class IntUniform extends Uniform<number> {
  protected write(loc: WebGLUniformLocation) { gl.uniform1i(loc, this.value); }
}

export class Vec3Uniform extends Uniform<vec3> {
  protected write(loc: WebGLUniformLocation) { gl.uniform3fv(loc, this.value); }
}

export class Vec4Uniform extends Uniform<vec4> {
  protected write(loc: WebGLUniformLocation) { gl.uniform4fv(loc, this.value); }
}

export class Mat4Uniform extends Uniform<mat4> {
  protected write(loc: WebGLUniformLocation) { gl.uniformMatrix4fv(loc, false, this.value); }
}
