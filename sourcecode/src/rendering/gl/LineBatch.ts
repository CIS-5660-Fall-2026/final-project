import {gl} from '../../globals';
const FLOATS_PER_VERT = 6;

class LineBatch {
  data: Float32Array;
  maxSegments: number;
  segCount: number = 0;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;

  constructor(maxSegments: number) {
    this.maxSegments = maxSegments;
    this.data = new Float32Array(maxSegments * 2 * FLOATS_PER_VERT);

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 2 * 4);

    gl.bindVertexArray(null);
  }

  clear() {
    this.segCount = 0;
  }

  push(x0: number, y0: number, x1: number, y1: number,
       r: number, g: number, b: number, a: number) {
    if (this.segCount >= this.maxSegments) return;
    const d = this.data;
    let i = this.segCount * 2 * FLOATS_PER_VERT;
    d[i++] = x0; d[i++] = y0; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
    d[i++] = x1; d[i++] = y1; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
    this.segCount++;
  }

  draw() {
    if (this.segCount === 0) return;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.segCount * 2 * FLOATS_PER_VERT);
    gl.drawArrays(gl.LINES, 0, this.segCount * 2);
    gl.bindVertexArray(null);
  }
}

export default LineBatch;
