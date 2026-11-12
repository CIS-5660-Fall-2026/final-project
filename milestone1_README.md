# milestone1: visual rose and vine networks

Open `milestone1.hipnc`, enter `/obj/MILESTONE1`, and select the green **CONTROLS** node. Scrub frames **1–120**. This scene was rebuilt from the saved `RoseAndVines_RoseCenters.hipnc`; the original is unchanged. The pink pig, dark vine color, target mesh, and three root positions were retained. A newly scattered attraction field produces a different branch pattern.

## What to edit

| Change | Control or node |
|---|---|
| Vine growth | CONTROLS → Vine Growth (keyed) |
| Vine thickness / clearance | CONTROLS → Vine Radius / Vine Skin Clearance |
| Pointed vine ends | CONTROLS → Vine Tip Taper Length / Vine Tip Width Fraction |
| Branch pattern | CONTROLS → Pattern Seed, Attraction Point Count, Attraction Radius |
| Growth length / resolution | CONTROLS → Growth Iterations / Vine Step Length |
| Pull toward neighboring roses | CONTROLS → Neighbor Rose Attraction |
| Flower color / size | CONTROLS → Rose Color / Rose Size |
| Flower distance from face | CONTROLS → Rose Skin Clearance |
| Opening | CONTROLS → Rose Openness (keyed 25–112) |
| Flower emergence timing | CONTROLS → Rose Growth Start Frame / Duration / Stagger |
| Rose positions | EDIT_THREE_ROSE_LOCATIONS → three point positions; edit X and Y |

The rose roots are projected along -Z onto the front of the target, matching the original scene. When changing the target or its orientation, adjust those root positions and the projection direction in PROJECT_ROSE_ROOTS.

## Follow the numbered network boxes

1. **Target and rose centers:** Pig Head, Normal, Add, Ray, Color, and initial point attributes. Three editable Add SOP points replace scripted placement.
2. **Attraction field:** Clip selects the front of the surface; Scatter distributes targets. A visual nearest-point calculation keeps targets around the roots.
3. **Space colonization:** A native For-Each feedback loop retains the existing branch graph and unreached attraction points. Each target finds its nearest branch owner. Point Cloud Open searches targets by their stored `ownerP`, and Point Cloud Filter averages their attraction directions. Growth is projected onto the skin tangent plane, advanced a short step, then attached to the nearest surface location. Add SOP connects parent/child pairs, Fuse welds shared junctions, and reached targets are removed. This is not a shortest-path replacement.
4. **Vine animation and continuous widths:** A second feedback loop (box **03B**) counts descendants on the welded branch graph. The radius follows the Python reference rule: `max(0.12, (support / maximum_support)^0.42)`. Every curve at a shared junction inherits the same width before the graph is split, avoiding sudden diameter changes. The previous per-polyline length multiplier is disconnected. Clip uses `birth` to reveal segments in growth order. Free ends are detected before PolyPath/Resample split the topology; Distance Along Geometry and a short tip taper (length 0.04, width fraction 0.3) refine the ends. Interpolating Resample smooths the curves, Ray reattaches them to the face, and Round Tube Sweep makes the stems. The full graph is independent of frame, so backward scrubbing works without replaying a simulation.
5. **Roses:** A Grid becomes a parametric flower through connected math VOPs. Normal and Color provide shading attributes. Peak controls placement clearance while preserving point normals; Copy to Points aligns local +Z with those normals. Smooth VOPs animate emergence and outer-first opening.

Double-click blue **Attribute VOP** nodes to inspect the connected operations. No custom Python SOPs, Attribute Wrangles, Snippet VOPs, or Inline Code VOPs implement these stages. Standard Houdini nodes may themselves have vendor-provided internal implementations. Channel references and group selectors are ordinary Houdini parameter expressions.

## References and scope

- Runions, Lane, and Prusinkiewicz, *Modeling Trees with a Space Colonization Algorithm* (2007): https://www.algorithmicbotany.org/papers/colonization.egwnp2007.html . The scene adapts nearest-owner attraction, direction averaging, and reached-target removal to a surface and multiple rose roots. Neighbor attraction is an artistic extension.
- Paul Nylander, *Rose-Shaped Parametric Surface* (2006): https://nylander.wordpress.com/2006/06/21/rose-shaped-parametric-surface/ . The complete equations define the open flower. Bud deformation and timing are artistic additions.

The visual network preserves the behavior, but does not reproduce every Python-version branch exactly. It does not include thorn generation, physical petal collisions, or branch fusion between separate rose systems. Keep combined viewport geometry below the density that previously caused a blank viewport; the supplied default stays below 65,536 points.

Validation: clean node cooks; finite coordinates at frames 1, 30, 70, and 120; no vines or flowers at frame 1; growing branch counts over time; full flowers wider than buds; outward placement normals; visual preview checked in Houdini.
