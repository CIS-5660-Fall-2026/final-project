import {mat4} from 'gl-matrix';
import Drawable from './rendering/gl/Drawable';
import ShaderProgram from './rendering/gl/ShaderProgram';
import Camera from './Camera';

/**
 * Holds drawables, each paired with the shader that draws it.
 * Drawables are grouped by shader so per-shader state (view-proj, time,
 * custom uniforms) is uploaded once per frame rather than once per object.
 */
export default class Scene {
  private groups = new Map<ShaderProgram, Drawable[]>();
  private viewProj = mat4.create();

  /** Seconds since the scene started updating. Fed to u_Time. */
  time: number = 0;

  add<T extends Drawable>(drawable: T, shader: ShaderProgram): T {
    let group = this.groups.get(shader);
    if (!group) {
      group = [];
      this.groups.set(shader, group);
    }
    group.push(drawable);
    return drawable;
  }

  remove(drawable: Drawable) {
    for (const [shader, group] of this.groups) {
      const i = group.indexOf(drawable);
      if (i === -1) continue;
      group.splice(i, 1);
      if (group.length === 0) this.groups.delete(shader);
      return;
    }
  }

  update(dt: number) {
    this.time += dt;
    for (const group of this.groups.values()) {
      for (const d of group) d.update(dt);
    }
  }

  /** Assumes the caller has already cleared the framebuffer and set the viewport. */
  draw(camera: Camera) {
    // If your Camera exposes the combined matrix under another name, change this line.
    mat4.multiply(this.viewProj, camera.projectionMatrix, camera.viewMatrix);

    for (const [shader, group] of this.groups) {
      shader.use();
      shader.setViewProjMatrix(this.viewProj);
      shader.setTime(this.time);
      shader.applyUniforms();

      for (const d of group) {
        shader.setModelMatrix(d.modelMatrix());
        shader.setGeometryColor(d.color);
        shader.draw(d);
      }
    }
  }
}
