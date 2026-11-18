import {gl} from '../../globals';

class Accumulator {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number = 0;
  height: number = 0;

  constructor() {
    this.texture = gl.createTexture();
    this.fbo = gl.createFramebuffer();
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Accumulation framebuffer incomplete');
    }
    this.clear();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
  }

  clear() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
  }
}

export default Accumulator;