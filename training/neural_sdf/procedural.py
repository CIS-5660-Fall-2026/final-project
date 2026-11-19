"""PyTorch port of the procedural rock SDF in src/shaders/{noise,rocks}.wgsl.

The functions here must stay numerically identical to the WGSL versions; the
golden-data test (tests/test_procedural.py) enforces this.
"""

from __future__ import annotations

import torch

SPECIES_COUNT = 4
FBM_OCTAVES = 6
NOISE_FREQUENCY = 1.6
DISPLACEMENT_SCALE = 1.1
MAX_DISPLACEMENT = 0.55
LIPSCHITZ_SCALE = 0.6
BOUND_MARGIN = 0.8
# Points beyond this half extent always take the analytic bound branch.
TRAINING_BOX_HALF_EXTENT = 1.8

_HASH_SCALE = (0.1031, 0.1030, 0.0973)
_FBM_OFFSET = (1.7, 9.2, 3.1)
_CORNERS = [(dx, dy, dz) for dz in (0, 1) for dy in (0, 1) for dx in (0, 1)]


def _fract(x: torch.Tensor) -> torch.Tensor:
    return x - torch.floor(x)


def hash31(p: torch.Tensor) -> torch.Tensor:
    """Scalar hash of points with shape (..., 3); equals WGSL hash31 / hash33(p).x."""
    q = _fract(p * p.new_tensor(_HASH_SCALE))
    q = q + (q * (q[..., [1, 0, 2]] + 33.33)).sum(dim=-1, keepdim=True)
    return _fract((q[..., 0] + q[..., 1]) * q[..., 2])


def value_noise3(p: torch.Tensor) -> torch.Tensor:
    """Trilinearly interpolated value noise, shape (..., 3) -> (...)."""
    cell = torch.floor(p)
    f = p - cell
    w = f * f * (3.0 - 2.0 * f)
    c = [hash31(cell + p.new_tensor(corner)) for corner in _CORNERS]
    x00 = torch.lerp(c[0], c[1], w[..., 0])
    x10 = torch.lerp(c[2], c[3], w[..., 0])
    x01 = torch.lerp(c[4], c[5], w[..., 0])
    x11 = torch.lerp(c[6], c[7], w[..., 0])
    return torch.lerp(torch.lerp(x00, x10, w[..., 1]), torch.lerp(x01, x11, w[..., 1]), w[..., 2])


def fbm3(p: torch.Tensor) -> torch.Tensor:
    total = torch.zeros(p.shape[:-1], dtype=p.dtype, device=p.device)
    amplitude = 0.5
    offset = p.new_tensor(_FBM_OFFSET)
    for _ in range(FBM_OCTAVES):
        total = total + amplitude * value_noise3(p)
        p = p * 2.03 + offset
        amplitude *= 0.5
    return total


def rock_local_sdf(x: torch.Tensor, species: int) -> torch.Tensor:
    """Signed distance of one rock species in normalized local space.

  Args:
    x: Points with shape (..., 3).
    species: Rock species index in [0, SPECIES_COUNT).

  Returns:
    Distances with shape (...).
  """
    if not 0 <= species < SPECIES_COUNT:
        raise ValueError(f'species must be in [0, {SPECIES_COUNT}), got {species}')
    y = x * x.new_tensor((1.0, 1.0 + 0.1 * species, 1.0))
    base = torch.linalg.vector_norm(y, dim=-1) - 1.0
    seed = x.new_tensor((17.0 * species, 3.0, 0.0))
    displacement = (fbm3(y * NOISE_FREQUENCY + seed) - 0.5) * DISPLACEMENT_SCALE
    detailed = (base + displacement) * LIPSCHITZ_SCALE
    bound = (base - MAX_DISPLACEMENT) * LIPSCHITZ_SCALE
    return torch.where(base > BOUND_MARGIN, bound, detailed)
