// Dev-only: shows MediaPipe's canonical face (Apache-2.0, from google-ai-edge/mediapipe)
// as points in head space, to check that the anatomy sits under the face.
import * as THREE from "three";
import verts from "./canonicalFace.json";

export function canonicalFacePoints(): THREE.Points {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute((verts as number[][]).flat(), 3));
  const m = new THREE.PointsMaterial({ color: 0xffd166, size: 2.5, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.9 });
  const p = new THREE.Points(g, m);
  p.renderOrder = 10;
  return p;
}
