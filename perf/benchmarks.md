# Performance log / 性能记录

GPU: NVIDIA GeForce RTX 5070 Laptop · Chrome (WebGPU) · "benchmark view" camera

| Date | Version | Render scale | Resolution | FPS | Frame time |
|---|---|---|---|---|---|
| 2026-11-09 | Baseline: procedural rocks (6-octave 3D FBM, 3×3 cell search) | 0.5 | 1280×673 | 27.5 | 36.4 ms |
| 2026-11-09 | Baseline: procedural rocks (6-octave 3D FBM, 3×3 cell search) | 1.0 | 2560×1347 | 8.0 | 124.2 ms |
| 2026-11-18 | Baseline v2: 4 rock species + random yaw, strictly conservative far-field bound | 0.5 | 1280×673 | 15.8 | 63.1 ms |
| 2026-11-18 | Baseline v2: 4 rock species + random yaw, strictly conservative far-field bound | 1.0 | 2561×1347 | 4.6 | 219.4 ms |
