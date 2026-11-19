"""Exports a NeuralSdf as a binary weight blob plus a JSON manifest.

Binary layout: little-endian float32. For each linear layer, the weight matrix
(row-major, shape [out_features, in_features]) followed by its bias. Offsets in
the manifest are in float32 elements, not bytes.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from neural_sdf.model import NeuralSdf

FORMAT_VERSION = 1


def export_model(model: NeuralSdf, out_dir: Path, name: str,
                 metadata: dict[str, Any]) -> tuple[Path, Path]:
    """Writes `<name>.bin` and `<name>.json` into `out_dir` and returns both paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    chunks: list[np.ndarray] = []
    layers = []
    offset = 0
    for linear in model.linear_layers():
        weight = linear.weight.detach().cpu().numpy().astype('<f4').ravel()
        bias = linear.bias.detach().cpu().numpy().astype('<f4').ravel()
        layers.append({
            'in_features': linear.in_features,
            'out_features': linear.out_features,
            'weight_offset': offset,
            'bias_offset': offset + weight.size,
        })
        chunks += [weight, bias]
        offset += weight.size + bias.size

    bin_path = out_dir / f'{name}.bin'
    json_path = out_dir / f'{name}.json'
    np.concatenate(chunks).tofile(bin_path)
    manifest = {
        'format_version': FORMAT_VERSION,
        'name': name,
        'encoding': {
            'type': 'positional',
            'num_frequencies': model.encoding.num_frequencies,
            'layout': 'x, then sin/cos pairs per frequency (each xyz)',
        },
        'activation': 'relu',
        'weights': {
            'file': bin_path.name,
            'dtype': 'float32',
            'byte_order': 'little',
            'count': offset
        },
        'layers': layers,
        **metadata,
    }
    json_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return bin_path, json_path


def load_weights(json_path: Path) -> tuple[dict[str, Any], np.ndarray]:
    """Reads a manifest and its weight blob (used by tests and tooling)."""
    manifest = json.loads(json_path.read_text(encoding='utf-8'))
    weights = np.fromfile(json_path.parent / manifest['weights']['file'], dtype='<f4')
    if weights.size != manifest['weights']['count']:
        raise ValueError(f'{json_path}: expected {manifest["weights"]["count"]} floats, '
                         f'found {weights.size}')
    return manifest, weights
