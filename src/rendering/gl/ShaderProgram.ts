import {vec4, mat4} from 'gl-matrix';
import Drawable from './Drawable';
import {Uniform} from './Uniform';
import {gl} from '../../globals';

let activeProgram: WebGLProgram | null = null;

export class Shader {
  shader: WebGLShader;

  constructor(type: number, source: string) {
    this.shader = gl.createShader(type);
    gl.shaderSource(this.shader, source);
    gl.compileShader(this.shader);

    if (!gl.getShaderParameter(this.shader, gl.COMPILE_STATUS)) {
      throw gl.getShaderInfoLog(this.shader);
    }
  }
};

class ShaderProgram {
  prog: WebGLProgram;

  attrPos: number;
  attrNor: number;

  // Built-in uniforms the scene sets for every shader (per object / per frame).
  // Anything shader-specific (wobble, noise, ...) goes through Uniform classes instead.
  private unifModel: WebGLUniformLocation | null;
  private unifModelInvTr: WebGLUniformLocation | null;
  private unifViewProj: WebGLUniformLocation | null;
  private unifColor: WebGLUniformLocation | null;
  private unifTime: WebGLUniformLocation | null;

  private custom = new Map<string, Uniform<any>>();
  private invTr = mat4.create();

  constructor(shaders: Array<Shader>, uniforms: Array<Uniform<any>> = []) {
    this.prog = gl.createProgram();

    for (let shader of shaders) {
      gl.attachShader(this.prog, shader.shader);
    }
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      throw gl.getProgramInfoLog(this.prog);
    }

    this.attrPos = gl.getAttribLocation(this.prog, "vs_Pos");
    this.attrNor = gl.getAttribLocation(this.prog, "vs_Nor");

    this.unifModel      = gl.getUniformLocation(this.prog, "u_Model");
    this.unifModelInvTr = gl.getUniformLocation(this.prog, "u_ModelInvTr");
    this.unifViewProj   = gl.getUniformLocation(this.prog, "u_ViewProj");
    this.unifColor      = gl.getUniformLocation(this.prog, "u_Color");
    this.unifTime       = gl.getUniformLocation(this.prog, "u_Time");

    for (const u of uniforms) this.addUniform(u);
  }

  use() {
    if (activeProgram !== this.prog) {
      gl.useProgram(this.prog);
      activeProgram = this.prog;
    }
  }

  // ---- custom uniforms ----------------------------------------------------

  /** Link a uniform to this program. Returns it so you can keep a reference. */
  addUniform<U extends Uniform<any>>(u: U): U {
    if (!u.link(this.prog)) {
      // Either a typo in the name, or the GLSL compiler optimized it away.
      console.warn(`Uniform "${u.name}" not found in shader program`);
    }
    this.custom.set(u.name, u);
    return u;
  }

  getUniform<U extends Uniform<any> = Uniform<any>>(name: string): U {
    const u = this.custom.get(name);
    if (!u) throw new Error(`No uniform "${name}" registered on this shader`);
    return u as U;
  }

  /** Upload all custom uniforms. Call once per shader per frame, not per object. */
  applyUniforms() {
    this.use();
    for (const u of this.custom.values()) u.upload();
  }

  // ---- built-in uniforms --------------------------------------------------

  setModelMatrix(model: mat4) {
    this.use();
    if (this.unifModel !== null) {
      gl.uniformMatrix4fv(this.unifModel, false, model);
    }

    if (this.unifModelInvTr !== null) {
      mat4.invert(this.invTr, model);
      mat4.transpose(this.invTr, this.invTr);
      gl.uniformMatrix4fv(this.unifModelInvTr, false, this.invTr);
    }
  }

  setViewProjMatrix(vp: mat4) {
    this.use();
    if (this.unifViewProj !== null) {
      gl.uniformMatrix4fv(this.unifViewProj, false, vp);
    }
  }

  setGeometryColor(color: vec4) {
    this.use();
    if (this.unifColor !== null) {
      gl.uniform4fv(this.unifColor, color);
    }
  }

  setTime(time: number) {
    this.use();
    if (this.unifTime !== null) {
      gl.uniform1f(this.unifTime, time);
    }
  }

  // ---- drawing ------------------------------------------------------------

  draw(d: Drawable) {
    this.use();

    if (this.attrPos != -1 && d.bindPos()) {
      gl.enableVertexAttribArray(this.attrPos);
      gl.vertexAttribPointer(this.attrPos, 4, gl.FLOAT, false, 0, 0);
    }

    if (this.attrNor != -1 && d.bindNor()) {
      gl.enableVertexAttribArray(this.attrNor);
      gl.vertexAttribPointer(this.attrNor, 4, gl.FLOAT, false, 0, 0);
    }

    d.bindIdx();
    gl.drawElements(d.drawMode(), d.elemCount(), gl.UNSIGNED_INT, 0);

    if (this.attrPos != -1) gl.disableVertexAttribArray(this.attrPos);
    if (this.attrNor != -1) gl.disableVertexAttribArray(this.attrNor);
  }
};

export default ShaderProgram;
