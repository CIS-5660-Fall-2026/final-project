# Milestone 1 — Integration Decisions (final)

**Scope (from README):** static participating media from 3D FBM, rendered end-to-end with transmittance; no light scattering.
**Algorithm source:** Strand blog + Frostbite slides (`references/`). This sheet records how those passes plug into *this* codebase.

Codebase facts these decisions rely on:
- Canvas size is fixed at `initWebGPU()` (`clientWidth * devicePixelRatio`); no resize handler.
- `shaders.ts` builds shader strings at module-import time (before `initWebGPU()`), so canvas-dependent values can't be `${constants}`.
- Device uses default limits (4 storage textures / stage, 16 sampled textures / stage, 4 bind groups).
- Renderers are recreated on every mode switch (`setRenderer` in `main.ts`).
- Camera: fovY 45°, near 0.1, far 1000. `CameraUniforms` is 52 floats (208 B).
- Sponza (after the node's 0.008 scale) spans ~x ∈ [-15.4, 14.4], y ∈ [-1.0, 11.4], z ∈ [-9.5, 8.8]; diagonal ≈ 37.

---

## Frame flow

One command encoder per frame:
`lights.doLightClustering(encoder)` → `volumetrics.compute(encoder)` (one compute pass: voxelize → light → integrate) → Forward+ render pass (composite in the fragment shader).

## D1 — Froxel grid

- **Independent froxel grid** (not derived from or merged into the light cluster grid). M2 cluster lookup goes through position space: froxel → world/view position → cluster index via the existing log formula in `forward_plus.fs.wgsl`.
- **Fixed count: 240 × 135 × 64** (8 px tiles at 1080p). Dims are `${constants}`, like the cluster grid.
- **Tiles are defined in normalized screen space** (tile px = `screenResolution / gridDims`, same as the clustering shader). Screen UV = `pixel / screenResolution` everywhere; matches texture-normalized coords with no correction.
- **Fog near 0.5, fog far 40, distribution exponent 1.0** (pure log). All three are `FogUniforms` fields, tuned later.
- **Rule to keep the refactor cheap:** write all froxel math in terms of grid dims and normalized screen UV — never a hardcoded tile size in pixels or a literal 240/135.

## D2 — Ownership

`Volumetrics` class in `src/stage/volumetrics.ts`, owned by `Stage`, constructed in `main.ts` alongside `Lights`. Exposes `compute(encoder)` plus the integrated volume view, sampler and `FogUniforms` buffer for renderers to bind. Survives renderer switches (and keeps M2 history buffers alive).

## D3 — Pass structure

- **All three passes in M1; pass 2 (light) is a stub** that reads VBuffer A and writes (source, σt) to the lit volume with the D6 source term. M2 only replaces its body.
- **One compute pass, three dispatches** (each dispatch is its own usage scope, so write-then-read across dispatches is legal).
- Workgroup sizes as tweakable constants: **8×8×1** (voxelize, light), **8×8** (integrate, one thread per XY column looping over 64 slices).

## D4 — GPU resources

- **All froxel data in 3D textures, `rgba16float`** (filterable; write-only storage in core WebGPU). Usage `STORAGE_BINDING | TEXTURE_BINDING`. Each pass writes one volume via `texture_storage_3d<rgba16float, write>` and reads others via `texture_3d<f32>` (`textureLoad` / `textureSampleLevel`); never read-write.
- **VBuffer B (emissive, phase g) deferred to M2.**
- **Composite sampler:** linear min/mag, `clamp-to-edge` on U/V/W. (Clamping maps depths beyond fog far → last slice, nearer than slice 0's boundary → slice 0.)
- **Single `FogUniforms` buffer**, host class modelled on `CameraUniforms`, bound to all fog passes and the composite. Watch WGSL alignment (vec3 → 16 B).

| Resource | Contents | Written by | Read by |
|---|---|---|---|
| VBuffer A | σs.rgb, σt | voxelize | light |
| Lit volume | source.rgb, σt | light (stub) | integrate |
| Integrated volume | in-scatter.rgb, transmittance | integrate | composite (sampled) |
| `FogUniforms` | see below | CPU | all fog passes + composite |

`FogUniforms` M1 fields: fog near, fog far, distribution exponent, σs, σa, ambient color (vec3), noise frequency, octave count, density scale, height-fog base height, height falloff.

Memory: ~16.6 MB per volume (2.07 M froxels × 8 B); 3 volumes in M1.

## D5 — Camera uniforms

- **Add `invViewMat`** at float offset 52 (byte 208, 16-B aligned); `bufferBytes` 52 → 68 floats. Set in `Camera.onFrame` (`mat4.inverse(viewMat)`); append to the WGSL struct in the same position.
- Move `convertScreenToView` / `convertClipToView` / `intersectZPlane` into `common.wgsl`, **taking `invProjMat` and screen resolution as parameters** (they currently read the module-scope `camera` binding, which not every shader declares).
- M2 fields (prev viewProj, frame index, time) are added in M2.

## D6 — Source term (pass 2 stub)

- **source = σs × constant ambient color** (Strand's flat indirect term); ambient color in `FogUniforms`. Strictly this is ambient-only in-scattering — word the M1 README accordingly.
- No debug toggle: hardcode source = 0 temporarily to inspect pure absorption.
- Naming trap: in Strand's `source = sigmaS * Lin + sigmaE`, `sigmaE` is **emissive**, not extinction.

## D7 — Media & noise

- **Analytic FBM evaluated in the voxelize shader**, sampled at the froxel's **world position** (never grid index / UVW, or fog sticks to the camera).
- **Height-falloff shaping** (Strand's height fog): density decays exponentially above a base Y. Check the actual floor Y (scene min is ~−1). Doubles as a sanity check: an inverted/offset gradient means a broken view → world transform.
- **Scalar σs and σa**; σt = σa + σs. Voxelize broadcasts σs into VBuffer A's RGB. Starting values σs ≈ 0.04, σa ≈ 0.01 (σt ≈ 0.05, ~22% transmittance across Sponza).
- Note for later: Strand's code uses RGB σs with scalar σt, collapsing inconsistently (`length()` for depth/height fog — overstates σt by √3 for grey media; implicit `.x` truncation for local volumes). Don't copy either rule.

## D8 — Integration pass

- **σt = 0:** clamp σt to a small epsilon (e.g. 1e-6) before dividing.
- **Boundary convention:** each step is slice k's own view-Z thickness (far boundary − near boundary); integrated texel k = accumulation to **slice k's far boundary**. The composite's depth → `w` mapping must align texel centers with far boundaries.
- **Slice 0's step extends back to the camera near plane (0.1)**, treating the 0.1–0.5 gap as holding slice 0's media. Fog near is then purely a resolution parameter.
- **Step length = view-Z thickness** (no per-column 1/cos θ correction). Accepted limitation: fog is ~24% (edges) to ~31% (corners) too thin toward screen edges in uniform media.
- Use the energy-conserving analytic slab integral (Frostbite slide 28 / Strand Pass 3), not slide 27's "wrong" version.

## D9 — Composite

- **Forward+**: at the end of `forward_plus.fs.wgsl`, `final = shaded × T + inScatter`. Add the integrated volume, sampler and `FogUniforms` to the Forward+ **group 0** layout/bind group (bindings 3–5, `FRAGMENT`).
- Use `textureSampleLevel(..., 0.0)` (no mips; avoids `textureSample`'s uniform-control-flow requirement after the non-uniform `discard`). Reuse the shader's existing `zViewDistance`.
- Accepted limitation: **background (sky) pixels get no fog** — no fragment is shaded there. Height falloff keeps fog thin near the roofline, so the edge is mostly invisible in M1; dense smoke or depth fog later will expose it (fix: fullscreen composite pass with a sampleable depth texture).

## D10 — Validation

**One temporary hardcoded analytic check** in the composite: noise off, shaping off, constant σt, source = 0. Output |T_sampled − e^(−σt·(viewZ − 0.1))|; expect near-black. A radial brightening toward screen edges is the known D8.4 error, not a bug. Catches D8.2 boundary/mapping mismatches (banding at slice boundaries), wrong step lengths and broken world-position reconstruction. Remove afterwards; screenshot for the README.

---

## Close calls & deferred improvements

Decisions where we went back and forth; revisit if time allows or the visuals demand it.

- **D1 — grid sizing:** chose fixed count (predictable cost on unknown grader hardware, compile-time dims). Alternative: fixed ~8 px tiles (constant on-screen sharpness; cost scales with resolution/DPR; dims become runtime). Refactor is small if the D1 rule is followed.
- **D1 — fog near / exponent:** 0.5 / 1.0 for now. 0.1 spends ~17 of 64 slices in the first 0.4 units; 0.25 is a middle ground; near 0.1 with exponent < 1 is another route. With D8.3 in place, near is purely a resolution trade-off. Tune once dense smoke exists.
- **D6 — debug views:** no GUI toggles in M1; reconsider GUI-toggleable debug views (transmittance only, slice index, density) in M2.
- **D7.3 — RGB σs:** scalar for now. RGB σs enables per-volume color for overlapping media but forces a σt collapse rule (pick one deliberately — average or max — unlike Strand).
- **D8.2 (iv) — exact partial slice in the composite:** read the integrated volume at slice k−1's far boundary plus the lit volume at slice k, and integrate the partial slice exactly. Two volume reads per pixel, manual Z handling. Worth it if dense smoke shows banding at surfaces.
- **D8.4 — ray-length correction:** scale each column's step lengths by 1/cos θ (θ = angle between the tile-center ray and the view axis; constant per column). One factor per integrate thread; makes D10 exact across the whole screen. Candidate for spare time before the M1 deadline.

## Out of scope for M1

Cluster↔froxel light lookup, phase function, point-light scattering, VBuffer B, jitter/temporal history, noise animation, GUI media sliders (hardcoded `FogUniforms` values are fine), sky fog, clustered-deferred composite.

## M1 README deliverable

- Progress description against the M1 goals (plus the late-day note already in the README).
- Screenshots: baseline vs. fog, pure-absorption variant, and the D10 analytic-check view.
