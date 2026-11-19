# Ruin Reclamation: a procedural environment-aging tool

CIS 5660 Final Project Design Doc

## Introduction

A tool that ages a stone ruin: given a clean structure and an `age` slider, edges weather, blocks fall, and vines grow into the gaps.

Decay comes first and plants follow it: the structure side outputs where the crevices and shaded, damp spots are, and the vegetation side grows there. Plants do not affect the structure in the core version.

## Goal

*Revised 11/11: no Houdini Engine license is available (Apprentice only), so the Unreal Engine integration is dropped. Everything runs and is rendered inside Houdini (Karma). The sections below are updated to match.*

A Houdini Digital Asset that takes a block-based stone ruin and a single `age` parameter in \[0, 1\] and produces:

- a decayed version of the structure: weathered edges, blocks that fall out by a stability rule, rubble at the base
- a surface "growth field" (crevice, ambient occlusion, moisture) exported as point attributes
- vines grown from that field, swept into tube meshes with leaf cards instanced along them
- (stretch) a moss mask derived from the same field, blended into the stone material

Dragging `age` on the HDA regenerates the whole result. The deliverable is the HDA plus a short demo scene and video, rendered in Houdini with Karma, showing one ruin at five or six ages.

## Inspiration / reference

**Visual**

- Ta Prohm, Angkor (Cambodia): where vegetation settles on a ruin, in crevices and on shaded, lower courses.

  ![Vegetation on the ruins of Ta Prohm](media/ta-prohm-angkor.jpg)

  *Photo: Jerry Everard, [The Fog Watch](https://thefogwatch.com/cambodia-ta-prohm-angkor-treasure/).*

- Uncharted 4 and Shadow of the Tomb Raider overgrown ruin environments.

  ![Overgrown ruin environment](media/overgrown-jungle-ruin.jpg)

  *Image: [r/ACBFResynced on Reddit](https://www.reddit.com/r/ACBFResynced/comments/1x8rqly/shadow_of_the_tomb_raider_used_to_be_my_jungle/).*

- Ghost of Tsushima shrines: moss distribution by shade and moisture.

  ![Shrine reference for moss distribution](media/shrine-moss.jpg)

**Stone weathering and decay**

- Whiting, Ochsendorf, Durand, "Procedural Modeling of Structurally-Sound Masonry Buildings", SIGGRAPH Asia 2009. Block-level stability of unreinforced masonry; basis for our height / support stability heuristic.
- SideFX Houdini docs: RBD Material Fracture (brick mode), Labs Edge Damage, Occlusion SOP; Houdini Engine for Unreal.

**Plant growth**

- Runions, Lane, Prusinkiewicz, "Modeling Trees with a Space Colonization Algorithm", Eurographics NPH 2007.
- Hadrich, Benes, Deussen, Pirk, "Interactive Modeling and Authoring of Climbing Plants", Eurographics 2017. Climbing plants that attach to and follow surfaces, with gravity sag.
- SideFX ivy generator tutorials.

## Specification

**Input:** a stone ruin mesh made of individual blocks (each block its own piece, or an unsplit mesh that the tool voxel-splits into blocks on load), plus a ground plane.

**Core features**

1. Structure decay by `age`
   - Edge weathering: noise displacement weighted toward edges and upward faces
   - Block stability score from height and support from below gives each block a `fall_age`; at a given `age`, blocks past their `fall_age` are released into a Bullet RBD sim and settle on the ground as rubble
   - Stone color darkens with `age` (per-point `Cd` driven by `age` and `moisture`, picked up by the Karma material)
   - Outputs per-point `crevice`, `ao`, `moisture` attributes for the vegetation step
2. Vine growth
   - Space colonization seeded from high-`crevice` / high-`moisture` points; branches follow the surface with a gravity sag; length and branching scale with `age`
   - Meshed in Houdini: curves swept into tubes, leaf cards instanced along them
3. Demo scene (shared)
   - One Houdini scene with the structure HDA and the vine subnet chained; `age` and a few style parameters on the HDA; changing `age` recooks; rendered with Karma

**Plant / decay coupling.** One-way in the core: decay produces the growth field, plants read it, and plants have no effect on the structure. How the ruin collapses depends only on `age` and the stability rule. Feedback from plants to structure is listed under stretch.

**Stretch**

Stretch items are not ranked; in week 3 we pick whichever fits the remaining time, and only once all core features work.

- Moss mask = f(`ao`, `moisture`, distance to vine roots), grown with `age`, blended into the stone material
- Root-pressure feedback: vine root positions lower nearby block stability (`stability -= k * root_pressure`), so walls with vines fall first
- Block tilt / slide before falling
- Rain streaks and dirt accumulation on the stone
- Soil and leaf-litter burial of the lowest courses
- Leaf wind (animated noise on the leaf cards)
- Fly-through video with camera animation

**Cut list** (in order, if behind schedule): rubble fragments; voxelized mesh input (keep the procedural test asset); irregular block layout; root-pressure feedback; fixed vine branching instead of scaling with `age`.

## Techniques

### Test asset and blockifying (P1)

- Weeks 1-2: procedurally stacked test ruin (brick wall, a few columns, an arch) from grid-copied blocks
- Each block gets `piece` id, `height` (course index), `support` (blocks directly below), `edge` (end of wall)
- Week 3: irregular block layout; voxelize any input mesh into blocks and recompute the attributes

### Edge weathering (P1)

- Noise displacement weighted by an edge mask (distance to sharp edges) and an exposure mask (upward-facing normals), scaled by `age`
- Same approach as Houdini Labs Edge Damage
- Stretch: rain streaks by accumulating "rain" downward along the surface; core only darkens the stone material with `age`

### Stability and collapse (P1)

- Each block gets a stability score (Whiting et al. 2009 heuristic): lower for high courses, few supports, end-of-wall position
- Threshold rises with `age`; a block's `fall_age` is the `age` at which its score drops below it, or at which the blocks under it are gone, whichever comes first. The schedule does not depend on the current `age`
- At a given `age`, every block with `fall_age` below it is released into a Bullet RBD sim (96 frames, initial outward kick) and settles on the ground, so rubble piles up without interpenetration (replaces the rule-based placement from week 1)
- The sim re-runs whenever `age` or a layout parameter changes (about 1 s on the test asset). Which blocks fall is deterministic and continuous in `age`; where they land is deterministic for a given `age` but can rearrange between ages

### Growth field (P1, shared contract)

- `crevice` from curvature and edge distance
- `ao` from an Occlusion SOP
- `moisture` from height above ground, `ao` and facing
- Only interface between structure and vegetation; names agreed in week 1

### Vines (P2)

- Space colonization (Runions et al. 2007): attractors scattered on the surface weighted by `crevice` and `moisture`
- Growth nodes advance toward attractors, are projected back onto the surface each step, and sag with a gravity term (Hadrich et al. 2017)
- Growth budget scales with `age`; output polylines with a radius attribute

### Demo scene and render (shared)

- One Houdini scene: structure HDA, then the vine subnet on its output; `age` and style parameters on the HDA
- Vines arrive as curves and are swept into tube meshes, with leaf cards instanced along them
- Weathering and moss arrive as point color (`Cd`) feeding the Karma material
- Camera, lights and the age sequence rendered with Karma; no game engine step

## Design

```mermaid
flowchart LR
    A[Ruin mesh + ground] --> B[Blockify\npiece / height / support]
    AGE[age slider] --> C
    AGE --> E
    B --> C[Structure decay\nedge weathering + stability + rubble]
    C --> D[Growth field\ncrevice / ao / moisture]
    D --> E[Vine growth\nspace colonization]
    D -. stretch .-> F[Moss mask]
    E -. stretch: root pressure .-> C
    C --> G[Karma: stone mesh + rubble\nage-darkened Cd]
    E --> H[Karma: swept vine tubes\nleaf cards]
    F -. stretch .-> I[Karma: Cd\nmoss blend]
```

Everything left of the Karma nodes runs inside Houdini: the structure HDA plus the vine subnet. The growth field (`crevice`, `ao`, `moisture`) is the only contract between the structure side (P1) and the vegetation side (P2), so the two halves can be developed in parallel against a shared test asset.

## Timeline

P1 = structure (Anna), P2 = vegetation (Jacky).

*Revised 11/9: P1 is ahead of schedule, so the P1 column for weeks 2-3 is updated.*

*Revised 11/11: no Houdini Engine license, so the UE items in weeks 2-3 become their Houdini equivalents.*

*Revised 11/19: P1 week 3 updated with physics-based falling and new structure items.*

| Week | Due | P1 (structure) | P2 (vegetation) | Shared |
| --- | --- | --- | --- | --- |
| 1 (11/4 - 11/11) | Milestone 1 | Blockify test asset; `height` / `support`; first stability score; edge weathering displacement (done early: rubble, HDA, growth field export) | Attractor scatter on surface; basic space colonization in Houdini; surface projection | Agree attribute contract (`crevice`, `ao`, `moisture`, `age`) |
| 2 (11/11 - 11/18) |  | Optional geometry input on the HDA; test asset gets a doorway, window and L-corner; stone darkening by `age` as point color; first integration with P2 | Gravity sag, growth budget by `age`; vines exported as curves; vine tube mesh + leaf cards in Houdini | Karma demo scene with `age` exposed; integrate both halves on the shared asset; all core features working end to end |
| 3 (11/18 - 11/23) | Milestone 2 | Physics: blocks fall through a Bullet RBD sim at their `fall_age`, rubble piles without overlap; irregular block layout; voxelize any input mesh into blocks; growth field differs on rubble; rubble fragments (Voronoi-fracture some fallen blocks into 2-3 pieces); parameter cleanup; fix integration bugs; stretch: root-pressure feedback | Vine density tuning; fix integration bugs; stretch only if core is done: moss mask | Feature freeze 11/23; working demo for class critique; anything not working by now is cut |
| 4 (11/23 - 11/30) | Final | Touch-ups from critique; tune decay parameters | Touch-ups from critique; tune vine look | Lighting, camera, video, README results and post mortem, presentation prep. No new features. |
