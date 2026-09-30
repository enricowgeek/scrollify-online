// Velluto · il riflesso sulla pista lucida (dall'autolavaggio): la scena vista da sotto la pista (camera specchiata),
// disegnata in una texture piccola (metà della tela o meno). Il pavimento la legge con la matrice di proiezione e la
// muove un filo tavola per tavola. Si disegnano nel riflesso solo gli oggetti del layer 1.
import * as THREE from 'three';

export class Riflesso {
  constructor(scala = .5) {
    this.scala = scala;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: false });
    this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(1);
    this.matrice = new THREE.Matrix4();
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._d = new THREE.Vector3();
  }
  misura(w, h) { this.rt.setSize(Math.max(4, Math.round(w * this.scala)), Math.max(4, Math.round(h * this.scala))); }
  aggiorna(renderer, scena, camera) {
    const c = this.cam;
    camera.updateMatrixWorld();
    // posizione e punto guardato specchiati sul piano y = 0
    this._v.setFromMatrixPosition(camera.matrixWorld); this._v.y = -this._v.y;
    this._d.set(0, 0, -1).transformDirection(camera.matrixWorld);
    this._t.setFromMatrixPosition(camera.matrixWorld).add(this._d); this._t.y = -this._t.y;
    c.position.copy(this._v);
    c.up.set(0, 1, 0).transformDirection(camera.matrixWorld); c.up.y = -c.up.y;
    c.lookAt(this._t);
    c.far = camera.far; c.near = camera.near;
    c.projectionMatrix.copy(camera.projectionMatrix);
    c.updateMatrixWorld();
    c.matrixWorldInverse.copy(c.matrixWorld).invert();
    this.matrice.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    const prima = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scena, c);
    renderer.setRenderTarget(prima);
  }
}
