// Velluto · dopo il disegno (dall'autolavaggio): la scena in una texture HDR (con MSAA e profondità). Se si vedono i
// cocktail, un secondo passaggio: la scena copiata come sfondo e sopra il vetro, che legge la scena (per piegarla) e la
// profondità (per nascondersi dietro le cose). Poi i punti più luminosi si sfocano a 1/4, 1/8, 1/16 (bagliore morbido),
// vignetta, grana leggerissima, tone mapping ACES e sRGB. Un triangolo che copre lo schermo, niente librerie.
import * as THREE from 'three';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

export class Post {
  constructor(renderer, { msaa = 4 } = {}) {
    this.r = renderer;
    const opz = { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false };
    this.scena = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: msaa, generateMipmaps: false, depthTexture: new THREE.DepthTexture(4, 4) });
    this.vetro = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: msaa, generateMipmaps: false });
    this.copia = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: VERT, depthTest: false, depthWrite: false,
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.); }' });
    this.liv = [0, 1, 2].map(() => [new THREE.WebGLRenderTarget(4, 4, opz), new THREE.WebGLRenderTarget(4, 4, opz)]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g); this.quad.frustumCulled = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.estrai = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, uPx: { value: new THREE.Vector2() }, uSoglia: { value: 1.6 } },
      vertexShader: VERT, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */`uniform sampler2D t; uniform vec2 uPx; uniform float uSoglia; varying vec2 vUv;
        vec3 s(vec2 o){ vec3 c = texture2D(t, vUv + o * uPx).rgb; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.); float l = max(max(c.r, c.g), c.b); return c * smoothstep(uSoglia, uSoglia * 2.5, l); }
        void main(){ vec3 c = s(vec2(-1., -1.)) + s(vec2(1., -1.)) + s(vec2(-1., 1.)) + s(vec2(1., 1.)); gl_FragColor = vec4(min(c * .25, vec3(30.)), 1.); }`,
    });
    this.sfoca = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VERT, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */`uniform sampler2D t; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 c = texture2D(t, vUv).rgb * .227;
          c += (texture2D(t, vUv + uDir * 1.385).rgb + texture2D(t, vUv - uDir * 1.385).rgb) * .316;
          c += (texture2D(t, vUv + uDir * 3.231).rgb + texture2D(t, vUv - uDir * 3.231).rgb) * .07;
          gl_FragColor = vec4(c, 1.); }`,
    });
    this.giu = new THREE.ShaderMaterial({
      uniforms: { t: { value: null }, uPx: { value: new THREE.Vector2() } }, vertexShader: VERT, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */`uniform sampler2D t; uniform vec2 uPx; varying vec2 vUv;
        void main(){ vec3 c = texture2D(t, vUv + uPx * vec2(-.5, -.5)).rgb + texture2D(t, vUv + uPx * vec2(.5, -.5)).rgb + texture2D(t, vUv + uPx * vec2(-.5, .5)).rgb + texture2D(t, vUv + uPx * vec2(.5, .5)).rgb; gl_FragColor = vec4(c * .25, 1.); }`,
    });
    this.componi = new THREE.ShaderMaterial({
      uniforms: {
        tScena: { value: this.scena.texture }, t4: { value: this.liv[0][0].texture }, t8: { value: this.liv[1][0].texture }, t16: { value: this.liv[2][0].texture },
        uBagliore: { value: .6 }, uVignetta: { value: .42 }, uTempo: { value: 0 }, uAspetto: { value: 1 }, uEsposizione: { value: 1 }, uGrana: { value: .018 }, uNero: { value: 0 },
      },
      vertexShader: VERT, depthTest: false, depthWrite: false, toneMapped: true,
      fragmentShader: /* glsl */`uniform sampler2D tScena, t4, t8, t16; uniform float uBagliore, uVignetta, uTempo, uAspetto, uEsposizione, uGrana, uNero; varying vec2 vUv;
        float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main(){
          vec3 c = texture2D(tScena, vUv).rgb * uEsposizione; if (any(isnan(c))) c = vec3(0.);
          c += (texture2D(t4, vUv).rgb * .45 + texture2D(t8, vUv).rgb * .75 + texture2D(t16, vUv).rgb * 1.1) * uBagliore;
          vec2 v = vUv - .5; v.x *= uAspetto * .8;
          c *= 1. - uVignetta * smoothstep(.25, 1., length(v));
          c *= 1. - uNero;
          gl_FragColor = vec4(max(c, 0.), 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb += (h(gl_FragCoord.xy + fract(uTempo) * 91.) - .5) * uGrana;
        }`,
    });
  }
  misura(w, h) {
    this.scena.setSize(w, h); this.vetro.setSize(w, h);
    let lw = w, lh = h;
    for (let i = 0; i < 3; i++) {
      lw = Math.max(2, Math.round(lw / (i === 0 ? 4 : 2))); lh = Math.max(2, Math.round(lh / (i === 0 ? 4 : 2)));
      for (const t of this.liv[i]) t.setSize(lw, lh);
    }
    this.componi.uniforms.uAspetto.value = w / h;
    this.w = w; this.h = h;
  }
  passo(mat, destinazione) { this.quad.material = mat; this.r.setRenderTarget(destinazione); this.r.render(this.quad, this.cam); }
  // vetri: { uV (uniformi del vetro), attivo } o null
  disegna(scena, camera, vetri = null) {
    const r = this.r;
    r.setRenderTarget(this.scena); r.clear(); r.render(scena, camera);
    let sorgente = this.scena;
    if (vetri?.attivo) {
      vetri.uV.tSfondo.value = this.scena.texture; vetri.uV.tProf.value = this.scena.depthTexture; vetri.uV.uRis.value.set(this.w, this.h);
      this.copia.uniforms.t.value = this.scena.texture; this.passo(this.copia, this.vetro);
      const auto = r.autoClear; r.autoClear = false;
      r.setRenderTarget(this.vetro); r.clearDepth();
      camera.layers.set(3); r.render(scena, camera); camera.layers.set(0);
      r.autoClear = auto;
      sorgente = this.vetro;
    }
    this.componi.uniforms.tScena.value = sorgente.texture;
    this.estrai.uniforms.t.value = sorgente.texture; this.estrai.uniforms.uPx.value.set(1 / this.w, 1 / this.h);
    this.passo(this.estrai, this.liv[0][0]);
    for (let i = 0; i < 3; i++) {
      const [a, b] = this.liv[i];
      if (i > 0) { const p = this.liv[i - 1][0]; this.giu.uniforms.t.value = p.texture; this.giu.uniforms.uPx.value.set(1 / p.width, 1 / p.height); this.passo(this.giu, a); }
      for (let k = 0; k < (i === 2 ? 2 : 1); k++) {
        this.sfoca.uniforms.t.value = a.texture; this.sfoca.uniforms.uDir.value.set((1 + k) / a.width, 0); this.passo(this.sfoca, b);
        this.sfoca.uniforms.t.value = b.texture; this.sfoca.uniforms.uDir.value.set(0, (1 + k) / a.height); this.passo(this.sfoca, a);
      }
    }
    this.passo(this.componi, null);
  }
}
