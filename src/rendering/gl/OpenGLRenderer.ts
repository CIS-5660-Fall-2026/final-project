import {mat4, vec3, vec4} from 'gl-matrix';
import Drawable from './Drawable';
import Camera from '../../Camera';
import {gl} from '../../globals';
import ShaderProgram from './ShaderProgram';

// In this file, `gl` is accessible because it is imported above
class OpenGLRenderer {
  constructor(public canvas: HTMLCanvasElement) {
  }

  setClearColor(r: number, g: number, b: number, a: number) {
    gl.clearColor(r, g, b, a);
  }

  setSize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  render(camera: Camera, prog: ShaderProgram, draw_color1: vec3, draw_color2: vec3,
    draw_color3: vec3, draw_color4: vec3, 
    tail: number,
    speed: number,
    length: number,
    colorWave: number,
    drawables: Array<Drawable>) {

    let model = mat4.create();
    let viewProj = mat4.create();
    let color1 = vec4.fromValues(draw_color1[0]/255.0, draw_color1[1]/255.0, draw_color1[2]/255.0, 1.);
    let color2 = vec4.fromValues(draw_color2[0]/255.0, draw_color2[1]/255.0, draw_color2[2]/255.0, 1.);
    let color3 = vec4.fromValues(draw_color3[0]/255.0, draw_color3[1]/255.0, draw_color3[2]/255.0, 1.);
    let color4 = vec4.fromValues(draw_color4[0]/255.0, draw_color4[1]/255.0, draw_color4[2]/255.0, 1.);

    mat4.identity(model);
    mat4.multiply(viewProj, camera.projectionMatrix, camera.viewMatrix);
    prog.setModelMatrix(model);
    prog.setViewProjMatrix(viewProj);
    prog.setGeometryColor(color1);
    prog.setGeometryColor2(color2);
    prog.setGeometryColor3(color3);
    prog.setGeometryColor4(color4);
    prog.setTail(tail);
    prog.setSpeed(speed);
    prog.setLength(length);
    prog.setColorWave(colorWave);



    for (let drawable of drawables) {
      prog.draw(drawable);
    }
  }
  
  renderSkybox(camera: Camera, prog: ShaderProgram, skybox: Drawable) {
    let model = mat4.create();
    let viewProj = mat4.create();

    mat4.identity(model);

    mat4.multiply(
      viewProj,
      camera.projectionMatrix,
      camera.viewMatrix
    );

    prog.setModelMatrix(model);
    prog.setViewProjMatrix(viewProj);

    gl.cullFace(gl.FRONT);

    prog.draw(skybox);

    gl.cullFace(gl.BACK);
  }

};

export default OpenGLRenderer;
