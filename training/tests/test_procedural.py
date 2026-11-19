"""Checks that the PyTorch teacher matches the WGSL shader (golden data)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import torch

from neural_sdf import procedural

_GOLDEN = Path(__file__).parent / 'golden' / 'rock_local_sdf.json'


def _golden_rows() -> torch.Tensor:
    data = json.loads(_GOLDEN.read_text(encoding='utf-8'))
    return torch.tensor(data['samples'], dtype=torch.float32)


@pytest.mark.parametrize('species', range(procedural.SPECIES_COUNT))
def test_matches_wgsl(species: int) -> None:
    rows = _golden_rows()
    rows = rows[rows[:, 3] == species]
    assert len(rows) > 0
    predicted = procedural.rock_local_sdf(rows[:, :3], species)
    error = (predicted - rows[:, 4]).abs()
    # GPU and CPU float32 can disagree in the last bits of a hash, so allow a few
    # outliers but require nearly all samples to match closely.
    assert (error < 1e-3).float().mean() > 0.995, f'max error {error.max():.2e}'
    assert error.max() < 0.05


def test_far_points_use_conservative_bound() -> None:
    x = torch.tensor([[3.0, 0.0, 0.0], [0.0, -4.0, 0.0]])
    for species in range(procedural.SPECIES_COUNT):
        d = procedural.rock_local_sdf(x, species)
        assert torch.all(d > 0)


def test_invalid_species_raises() -> None:
    with pytest.raises(ValueError):
        procedural.rock_local_sdf(torch.zeros(1, 3), procedural.SPECIES_COUNT)
