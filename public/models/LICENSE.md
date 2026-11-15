# Anatomy model licence

`anatomy.glb` and `body.glb` are NOT covered by the app's code licence.

It is derived from **BodyParts3D**, © The Database Center for Life Science,
licensed under Creative Commons Attribution-Share Alike 2.1 Japan:
https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en
Source: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/

Modifications: selected structures merged, transformed into MediaPipe's
canonical face space (scaled, re-aligned, slight vertical rescale above/below
eye level), simplified and compressed. Built by `scripts/build-anatomy.mjs`.
`body.glb`: skeleton bones re-expressed in pose-driven frames (torso frame and
joint-to-joint limb frames), simplified and compressed. Built by `scripts/build-body.mjs`.

These modified models are redistributed under the same licence (CC BY-SA 2.1 JP).
