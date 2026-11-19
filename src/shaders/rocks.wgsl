const ROCK_CELL_SIZE: f32 = 14.0;
const ROCK_SPAWN_PROBABILITY: f32 = 0.45;
const ROCK_SPECIES_COUNT: u32 = 4u;

// Local-space rock shape: unit sphere displaced by fbm3, then scaled for safe stepping.
// Keep in sync with training/neural_sdf/procedural.py.
// 局部空间的石头：单位球加 fbm3 位移，再乘缩放系数保证步进安全。
// 必须和 training/neural_sdf/procedural.py 保持一致。
const ROCK_NOISE_FREQUENCY: f32 = 1.6;
const ROCK_DISPLACEMENT_SCALE: f32 = 1.1;
const ROCK_MAX_DISPLACEMENT: f32 = 0.55;
const ROCK_LIPSCHITZ_SCALE: f32 = 0.6;
const ROCK_BOUND_MARGIN: f32 = 0.8;

struct RockInstance {
  center: vec3f,
  scale: f32,
  cosYaw: f32,
  sinYaw: f32,
  species: u32,
  exists: bool,
};

fn rockInstance(cell: vec2f) -> RockInstance {
  let r = hash33(vec3f(cell, 7.0));
  let s = hash33(vec3f(cell, 11.0));
  let scale = 1.5 + 2.5 * r.x;
  let centerXZ = (cell + 0.5) * ROCK_CELL_SIZE + (r.xy - 0.5) * ROCK_CELL_SIZE * 0.4;
  let yaw = s.x * 6.2831853;
  return RockInstance(
      vec3f(centerXZ.x, terrainHeight(centerXZ) - 0.15 * scale, centerXZ.y),
      scale, cos(yaw), sin(yaw),
      min(u32(s.y * f32(ROCK_SPECIES_COUNT)), ROCK_SPECIES_COUNT - 1u),
      r.z <= ROCK_SPAWN_PROBABILITY);
}

// Procedural SDF of one species in local space. This is the teacher the neural SDF learns.
// 某一种石头在局部空间的程序化 SDF，也就是神经 SDF 要学习的“老师”。
fn rockLocalSdf(x: vec3f, species: u32) -> f32 {
  let y = x * vec3f(1.0, 1.0 + 0.1 * f32(species), 1.0);
  let base = length(y) - 1.0;
  // Outside the displacement range the noise cannot reach the surface: use a cheap,
  // conservative bound. The same margin defines the network's training domain.
  // 超出位移范围后噪声不可能碰到表面，直接返回保守下界；这个范围也是网络的训练区域。
  if (base > ROCK_BOUND_MARGIN) {
    return (base - ROCK_MAX_DISPLACEMENT) * ROCK_LIPSCHITZ_SCALE;
  }
  let seed = vec3f(17.0 * f32(species), 3.0, 0.0);
  let displacement = (fbm3(y * ROCK_NOISE_FREQUENCY + seed) - 0.5) * ROCK_DISPLACEMENT_SCALE;
  return (base + displacement) * ROCK_LIPSCHITZ_SCALE;
}

fn rockSdfInCell(p: vec3f, cell: vec2f) -> f32 {
  let rock = rockInstance(cell);
  if (!rock.exists) {
    return 1e5;
  }
  let w = (p - rock.center) / rock.scale;
  let local = vec3f(rock.cosYaw * w.x - rock.sinYaw * w.z, w.y,
                    rock.sinYaw * w.x + rock.cosYaw * w.z);
  return rockLocalSdf(local, rock.species) * rock.scale;
}

// A rock can extend into neighboring cells, so all 3x3 neighbors are tested.
// 石头可能伸进相邻格子，所以要检查周围 3x3 个格子。
fn rockSdf(p: vec3f) -> f32 {
  let cell = floor(p.xz / ROCK_CELL_SIZE);
  var d = 1e5;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      d = min(d, rockSdfInCell(p, cell + vec2f(f32(i), f32(j))));
    }
  }
  return d;
}
