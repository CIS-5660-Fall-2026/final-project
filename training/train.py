"""Distills procedural rock SDFs into small MLPs and exports them for WebGPU.

Usage (from the repository root):
  python training/train.py                  # all species, default settings
  python training/train.py --species 0 --steps 2000
"""

from __future__ import annotations

import argparse
import math
import time
from pathlib import Path

import torch

from neural_sdf import procedural
from neural_sdf.export import export_model
from neural_sdf.model import NeuralSdf

_REPO_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_OUT_DIR = _REPO_ROOT / 'public' / 'models'
# Distances this close to zero count as "near surface" for the quality metric.
_NEAR_SURFACE = 0.05


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--species',
                        type=int,
                        nargs='+',
                        default=list(range(procedural.SPECIES_COUNT)))
    parser.add_argument('--steps', type=int, default=8000)
    parser.add_argument('--batch-size', type=int, default=1 << 16)
    parser.add_argument('--dataset-size', type=int, default=1 << 21)
    parser.add_argument('--hidden-width', type=int, default=64)
    parser.add_argument('--hidden-layers', type=int, default=2)
    parser.add_argument('--frequencies', type=int, default=6)
    parser.add_argument('--learning-rate', type=float, default=1e-3)
    parser.add_argument('--seed', type=int, default=0)
    parser.add_argument('--device', default='auto', help='auto, cuda, mps or cpu')
    parser.add_argument('--out-dir', type=Path, default=_DEFAULT_OUT_DIR)
    return parser.parse_args()


def select_device(name: str) -> torch.device:
    if name != 'auto':
        return torch.device(name)
    if torch.cuda.is_available():
        return torch.device('cuda')
    if torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def sample_points(n: int, generator: torch.Generator, device: torch.device) -> torch.Tensor:
    """Half uniform in the training box, half concentrated around the rock surface."""
    half = procedural.TRAINING_BOX_HALF_EXTENT
    n_uniform = n // 2
    uniform = (torch.rand(n_uniform, 3, generator=generator, device=device) * 2 - 1) * half
    directions = torch.randn(n - n_uniform, 3, generator=generator, device=device)
    directions = directions / torch.linalg.vector_norm(directions, dim=-1, keepdim=True)
    radii = 1.0 + 0.35 * torch.randn(n - n_uniform, 1, generator=generator, device=device)
    near = (directions * radii).clamp(-half, half)
    return torch.cat([uniform, near])


@torch.no_grad()
def build_dataset(species: int, size: int, generator: torch.Generator,
                  device: torch.device) -> tuple[torch.Tensor, torch.Tensor]:
    points = sample_points(size, generator, device)
    # Chunked to bound memory: the teacher evaluates 8 hashes x 6 octaves per point.
    # 分块计算以控制显存：老师函数每个点要算 6 层、每层 8 个哈希。
    targets = torch.cat(
        [procedural.rock_local_sdf(chunk, species) for chunk in points.split(1 << 18)])
    return points, targets


@torch.no_grad()
def evaluate(model: NeuralSdf, points: torch.Tensor, targets: torch.Tensor) -> dict[str, float]:
    predictions = torch.cat([model(chunk) for chunk in points.split(1 << 18)])
    error = (predictions - targets).abs()
    near = targets.abs() < _NEAR_SURFACE
    return {
        'mae': error.mean().item(),
        'mae_near_surface': error[near].mean().item(),
        'max_error': error.max().item(),
        'sign_accuracy': (torch.sign(predictions) == torch.sign(targets)).float().mean().item(),
    }


def train_species(species: int, args: argparse.Namespace, device: torch.device) -> None:
    generator = torch.Generator(device=device).manual_seed(args.seed + species)
    torch.manual_seed(args.seed + species)
    train_points, train_targets = build_dataset(species, args.dataset_size, generator, device)
    eval_points, eval_targets = build_dataset(species, 1 << 18, generator, device)

    model = NeuralSdf(args.frequencies, args.hidden_width, args.hidden_layers).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, args.steps)

    start = time.perf_counter()
    log_every = max(1, args.steps // 10)
    for step in range(1, args.steps + 1):
        index = torch.randint(0,
                              args.dataset_size, (args.batch_size,),
                              generator=generator,
                              device=device)
        loss = (model(train_points[index]) - train_targets[index]).abs().mean()
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
        scheduler.step()
        if step % log_every == 0 or step == args.steps:
            print(f'  species {species}  step {step:6d}/{args.steps}  L1 {loss.item():.5f}')

    metrics = evaluate(model, eval_points, eval_targets)
    elapsed = time.perf_counter() - start
    print(f'  species {species}  eval ' + '  '.join(f'{k} {v:.5f}' for k, v in metrics.items()) +
          f'  ({elapsed:.1f}s)')
    if not math.isfinite(metrics['mae']):
        raise RuntimeError(f'species {species}: training diverged')

    _, json_path = export_model(
        model, args.out_dir, f'rock_species{species}', {
            'species': species,
            'training_box_half_extent': procedural.TRAINING_BOX_HALF_EXTENT,
            'bound_margin': procedural.BOUND_MARGIN,
            'metrics': metrics,
            'hyperparameters': {
                'steps': args.steps,
                'batch_size': args.batch_size,
                'dataset_size': args.dataset_size,
                'hidden_width': args.hidden_width,
                'hidden_layers': args.hidden_layers,
                'learning_rate': args.learning_rate,
                'seed': args.seed,
            },
        })
    print(
        f'  saved {json_path.relative_to(_REPO_ROOT) if json_path.is_relative_to(_REPO_ROOT) else json_path}'
    )


def main() -> None:
    args = parse_args()
    device = select_device(args.device)
    print(f'device: {device}')
    for species in args.species:
        train_species(species, args, device)


if __name__ == '__main__':
    main()
