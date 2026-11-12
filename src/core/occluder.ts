import * as THREE from "three";

/**
 * Depth-only material that writes the NEAREST possible depth (and no colour).
 * Drawn first, it punches a hole in everything rendered after it with depth
 * testing, which is how real hands hide the anatomy behind them.
 */
export function createOccluderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = -gl_Position.w; // NDC z = -1 → depth 0 (nearest)
      }
    `,
    fragmentShader: /* glsl */ `void main() { gl_FragColor = vec4(0.0); }`,
    colorWrite: false,
    depthWrite: true,
    depthTest: false,
    side: THREE.DoubleSide,
  });
}

/** Unit capsule along +Y from 0..1 (radius 1 caps are squashed by scaling, fine for masks). */
export function unitCapsule(): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(1, 1, 4, 12);
  g.translate(0, 0.5, 0);
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Places a unit capsule between a and b with the given radius. */
export function placeCapsule(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
  const dir = b.clone().sub(a);
  const len = Math.max(dir.length(), 1e-3);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
  m.scale.set(r, len, r);
}

/** A convex polygon fan whose vertices are rewritten every frame. */
export class FanPolygon {
  readonly geometry: THREE.BufferGeometry;
  private pos: THREE.BufferAttribute;
  constructor(readonly n: number) {
    this.geometry = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", this.pos);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
    this.geometry.setIndex(idx);
  }
  /** Points should be in order around the shape; centre is their average. */
  set(points: THREE.Vector3[]): void {
    const c = new THREE.Vector3();
    points.forEach((p) => c.add(p));
    c.divideScalar(points.length);
    this.pos.setXYZ(0, c.x, c.y, c.z);
    points.forEach((p, i) => this.pos.setXYZ(i + 1, p.x, p.y, p.z));
    this.pos.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}
