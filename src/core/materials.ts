import * as THREE from "three";

export type LookMode = "xray" | "solid";

/** Reveal modes: 0 = whole, 1 = head-space plane (half/top/lower), 2 = screen-space lens. */
export const RevealKind = { None: 0, Plane: 1, Lens: 2 } as const;

/**
 * Uniforms shared by every anatomy material, so a single UI change (brightness,
 * reveal mode, lens position…) updates all layers at once.
 */
export function createSharedUniforms() {
  return {
    uBrightness: { value: 1.0 },
    uSolid: { value: 0.0 }, // 0 = x-ray, 1 = solid
    uOpacity: { value: 1.0 },
    uRevealKind: { value: 0 },
    uWorldToHead: { value: new THREE.Matrix4() },
    uPlane: { value: new THREE.Vector4(1, 0, 0, 0) }, // head-space plane (n, d): keep where dot(n,p) > d
    uFeather: { value: 0.6 }, // cm for plane, px fraction for lens
    uLens: { value: new THREE.Vector3(-1, -1, 0) }, // x,y in device px (GL coords), radius in px
    uTime: { value: 0 },
  };
}
export type SharedUniforms = ReturnType<typeof createSharedUniforms>;

const vertexShader = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_vertex>
  uniform mat4 uWorldToHead;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vHeadPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vHeadPos = (uWorldToHead * worldPos).xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    vNormal = normalize(normalMatrix * normal);
    // orthographic overlays (hands/body) look straight down -z everywhere
    vView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uSolidColor;
  uniform float uActivation;
  uniform float uHighlight;
  uniform float uBrightness;
  uniform float uSolid;
  uniform float uOpacity;
  uniform int uRevealKind;
  uniform vec4 uPlane;
  uniform float uFeather;
  uniform vec3 uLens;
  uniform float uTime;
  uniform float uLayerAlpha;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vHeadPos;

  float revealMask() {
    if (uRevealKind == 1) {
      float s = dot(uPlane.xyz, vHeadPos) - uPlane.w;
      return smoothstep(-uFeather, uFeather, s);
    }
    if (uRevealKind == 2) {
      float d = distance(gl_FragCoord.xy, uLens.xy);
      float f = max(uLens.z * uFeather, 1.0);
      return 1.0 - smoothstep(uLens.z - f, uLens.z, d);
    }
    return 1.0;
  }

  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float mask = revealMask() * uLayerAlpha;
    if (mask <= 0.001) discard;

    float pulse = 0.5 + 0.5 * sin(uTime * 6.0);
    vec3 activeTint = vec3(1.0, 0.25, 0.15);
    vec3 hiTint = vec3(1.0, 0.85, 0.2);

    if (uSolid < 0.5) {
      float rim = pow(1.0 - abs(dot(n, v)), 2.2);
      vec3 col = mix(uColor, activeTint, uActivation);
      col = mix(col, hiTint, uHighlight * (0.6 + 0.4 * pulse));
      float a = clamp((0.07 + rim) * uBrightness * (1.0 + uActivation * 1.5 + uHighlight), 0.0, 1.0) * mask;
      gl_FragColor = vec4(col * a, a);
    } else {
      vec3 l1 = normalize(vec3(0.4, 0.6, 1.0));
      vec3 l2 = normalize(vec3(-0.6, -0.2, 0.5));
      float diff = max(dot(n, l1), 0.0) * 0.75 + max(dot(n, l2), 0.0) * 0.3 + 0.22;
      float spec = pow(max(dot(reflect(-l1, n), v), 0.0), 24.0) * 0.25;
      vec3 col = mix(uSolidColor, activeTint, uActivation * 0.7);
      col = mix(col, hiTint, uHighlight * (0.5 + 0.3 * pulse));
      col = col * diff * uBrightness + spec;
      gl_FragColor = vec4(col, uOpacity * mask);
    }
  }
`;

export interface AnatomyMaterial extends THREE.ShaderMaterial {
  uniforms: SharedUniforms & {
    uColor: { value: THREE.Color };
    uSolidColor: { value: THREE.Color };
    uActivation: { value: number };
    uHighlight: { value: number };
    uLayerAlpha: { value: number };
  };
}

export function createAnatomyMaterial(
  shared: SharedUniforms,
  xrayColor: THREE.ColorRepresentation,
  solidColor: THREE.ColorRepresentation,
): AnatomyMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...shared, // same uniform objects → shared live values
      uColor: { value: new THREE.Color(xrayColor) },
      uSolidColor: { value: new THREE.Color(solidColor) },
      uActivation: { value: 0 },
      uHighlight: { value: 0 },
      uLayerAlpha: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    clipping: true,
    side: THREE.DoubleSide,
  }) as AnatomyMaterial;
  applyLook(m, "xray");
  return m;
}

export function applyLook(m: THREE.ShaderMaterial, mode: LookMode): void {
  if (mode === "xray") {
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.side = THREE.DoubleSide;
  } else {
    m.transparent = true;
    m.depthWrite = true;
    m.blending = THREE.NormalBlending;
    m.side = THREE.FrontSide;
  }
  m.needsUpdate = true;
}
