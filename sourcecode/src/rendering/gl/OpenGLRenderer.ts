import {gl} from '../../globals';

class OpenGLRenderer {
  constructor(public canvas: HTMLCanvasElement) {}

  setClearColor(r: number, g: number, b: number, a: number) {
    gl.clearColor(r, g, b, a);
  }

  setSize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear() {
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}

export default OpenGLRenderer;
