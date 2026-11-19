"""Round-trip test for the binary weight export format."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch

from neural_sdf.export import FORMAT_VERSION, export_model, load_weights
from neural_sdf.model import NeuralSdf


def _reference_forward(manifest: dict, weights: np.ndarray, x: np.ndarray) -> np.ndarray:
    """Re-implements inference from the exported data only, as WGSL will."""
    frequencies = 2.0**np.arange(manifest['encoding']['num_frequencies'])
    features = [x]
    for f in frequencies:
        features += [np.sin(f * x), np.cos(f * x)]
    h = np.concatenate(features, axis=-1)
    layers = manifest['layers']
    for i, layer in enumerate(layers):
        w = weights[layer['weight_offset']:layer['bias_offset']].reshape(
            layer['out_features'], layer['in_features'])
        b = weights[layer['bias_offset']:layer['bias_offset'] + layer['out_features']]
        h = h @ w.T + b
        if i < len(layers) - 1:
            h = np.maximum(h, 0.0)
    return h[..., 0]


def test_export_round_trip(tmp_path: Path) -> None:
    torch.manual_seed(0)
    model = NeuralSdf(num_frequencies=4, hidden_width=16, hidden_layers=2)
    _, json_path = export_model(model, tmp_path, 'test_model', {'species': 0})

    manifest, weights = load_weights(json_path)
    assert manifest['format_version'] == FORMAT_VERSION
    assert weights.size == sum(p.numel() for p in model.parameters())

    x = np.random.default_rng(0).uniform(-1.5, 1.5, size=(64, 3)).astype(np.float32)
    expected = model(torch.from_numpy(x)).detach().numpy()
    np.testing.assert_allclose(_reference_forward(manifest, weights, x),
                               expected,
                               rtol=1e-5,
                               atol=1e-5)
