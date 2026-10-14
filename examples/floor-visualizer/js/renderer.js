// Renderer WebGL2: tekstury wejściowe + jeden przebieg kompozytu.
import { VERTEX, FRAGMENT } from './shaders.js';

const INT_UNIFORMS = new Set([
  'uFloorOn', 'uPattern', 'uRealistic', 'uWallOn', 'uDoorOn', 'uDoorStyle', 'uDoorWood',
  'uFrameOn', 'uFrameWood', 'uDoorCount', 'uShowOriginal', 'uHasLeft',
]);

export class WebGLUnavailableError extends Error {}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new WebGLUnavailableError('WebGL2 niedostępny');
    this.gl = gl;
    this.program = this.#link(VERTEX, FRAGMENT);
    this.locations = new Map();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = {
      image: this.#texture(0),
      shade: this.#texture(1),
      mask: this.#texture(2),
      left: this.#texture(3),
    };
    this.size = [1, 1];
    gl.useProgram(this.program);
    ['uImage', 'uShade', 'uMask', 'uLeft'].forEach((n, i) => gl.uniform1i(this.#loc(n), i));
    // Domyślne puste tekstury, aby shader zawsze miał poprawne wejścia.
    this.setShade(new Uint8Array([255]), 1, 1);
    this.setMask(new Uint8Array(4), 1, 1);
    this.setLeft(null);
  }

  #link(vs, fs) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  #texture(unit) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return { t, unit };
  }

  #bind(tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + tex.unit);
    gl.bindTexture(gl.TEXTURE_2D, tex.t);
  }

  #loc(name) {
    if (!this.locations.has(name)) this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    return this.locations.get(name);
  }

  /** Obraz wejściowy (canvas / ImageBitmap); domyślnie dopasowuje rozmiar bufora rysowania. */
  setImage(source, { resize = true } = {}) {
    const gl = this.gl;
    this.#bind(this.tex.image);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (resize) this.resize(source.width, source.height);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.size = [w, h];
  }

  /** Mapa cieniowania podłogi — jeden kanał 8-bit. */
  setShade(data, w, h) {
    const gl = this.gl;
    this.#bind(this.tex.shade);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  /** Maska RGBA: r=podłoga, g=ściany, b=drzwi, a=ościeżnice (bez premultiplikacji). */
  setMask(data, w, h) {
    const gl = this.gl;
    this.#bind(this.tex.mask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /** Lewa strona porównania suwakiem (render wariantu) lub null = oryginał. */
  setLeft(source) {
    const gl = this.gl;
    this.#bind(this.tex.left);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.hasLeft = !!source;
  }

  render(uniforms) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    Object.values(this.tex).forEach((t) => this.#bind(t));
    const all = { ...uniforms, uSize: this.size, uHasLeft: this.hasLeft ? 1 : 0 };
    for (const [name, value] of Object.entries(all)) this.#set(name, value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  #set(name, value) {
    const gl = this.gl;
    if (name === 'uDoorInv') {
      const l = gl.getUniformLocation(this.program, 'uDoorInv[0]');
      if (l) gl.uniformMatrix3fv(l, false, value);
      return;
    }
    const l = this.#loc(name);
    if (!l) return;
    if (INT_UNIFORMS.has(name)) gl.uniform1i(l, value);
    else if (typeof value === 'number') gl.uniform1f(l, value);
    else if (value.length === 2) gl.uniform2fv(l, value);
    else if (value.length === 3) gl.uniform3fv(l, value);
    else if (value.length === 9) gl.uniformMatrix3fv(l, false, value);
  }
}
