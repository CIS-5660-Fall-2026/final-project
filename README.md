# CosmicChaos

*A tiny universe with a questionable life expectancy.*

## Idea

Build a 3D gravity sandbox in WebGPU where bodies attract each other, collide, merge, and eventually explode into smaller fragments. A tiny universe with plenty of opportunities for chaos!

## Features

The core simulation features are mutual gravity, collisions, merging, and explosions. I’m aiming for around 10,000 planets and stars, depending on performance. I’ll compare a naive all-pairs solver with a tiled solver that reuses data in workgroup memory.

Planets and stars will have procedurally generated appearances inspired by real celestial bodies, with varied colors, surface patterns, and glowing effects.

## Presentation

The final product will run in a web browser, allowing users to explore the tiny universe with a movable camera. Controls will adjust simulation speed, gravity strength, the explosion threshold, and the initial number of bodies.

If time allows, I’ll add interactions such as clicking a body to trigger an explosion or using the mouse to apply an external force.

## Visual Assets

No external visual assets are needed. Planets and stars will be generated procedurally using mass, color, and a random seed. Noise-based shaders will create surface patterns and variation.

## Milestones

- **Week 1 — by Nov 11:** Set up WebGPU, camera controls, and procedural body generation. Implement the naive gravity solver, motion integration, and basic collision detection.
- **Week 2 — by Nov 18:** Implement merging, explosions, and fragment recycling. Add the tiled gravity solver and compare its performance with the naive version.
- **Week 3 — by Nov 23:** Finish procedural surfaces, glow, and simulation controls. Test larger body counts, fix simulation issues, and finalize the core features.
- **Week 4 — by Nov 30:** Polish the visuals and scene presets, add optional interactions if time permits, and prepare the browser demo, video, and final writeup.

## Resources

- [Robert Hodgin — Collider](https://roberthodgin.com/project/collider): Visual inspiration and the attraction–growth–explosion cycle.
- [NVIDIA — Fast N-Body Simulation with CUDA](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-31-fast-n-body-simulation-cuda): Gravitational softening and tiled computation, which I’ll adapt to WGSL.