from __future__ import annotations

import copy
import platform
import random
from dataclasses import dataclass
from typing import Sequence

import numpy as np
import torch
from torch import nn

# PyTorch permits setting inter-op parallelism only before parallel work begins.
# Configure it once at module initialization; later boundaries attest rather than reset it.
if torch.get_num_interop_threads() != 1:
    try:
        torch.set_num_interop_threads(1)
    except RuntimeError as error:
        raise RuntimeError(
            "quant_ml must initialize before PyTorch inter-op parallel work"
        ) from error

from .config import (
    SEALED_EXPERIMENT_CONFIG_HASH,
    SEALED_NUMPY_VERSION,
    SEALED_PYTHON_VERSION,
    SEALED_TORCH_VERSION,
    ModelConfig,
    TrainingConfig,
)
from .contracts import (
    ContractError,
    FeatureDataset,
    REAL_PIT,
    RowMetadata,
    stable_hash,
    validate_dataset,
)
from .model import HalalCausalTcnAlpha
from .splits import (
    PurgedFold,
    build_frozen_walk_forward_folds,
    five_fold_assignment_hash,
    split_assignment_hash,
    validate_purged_assignment,
)


PREPROCESSOR_CONTRACT = {
    "version": "decision-date-cross-sectional-winsor-median-iqr-v1",
    "group_by": "decision_session",
    "axes": "rows within [lookback_position,channel]",
    "winsor_quantiles": [0.01, 0.99],
    "center": "median",
    "scale": "interquartile_range",
    "zero_iqr_fallback": 1.0,
    "future_date_fit": False,
}


@dataclass(frozen=True)
class DecisionDateCrossSectionalPreprocessor:
    contract_hash: str = stable_hash(PREPROCESSOR_CONTRACT)

    def transform(
        self, features: np.ndarray, metadata: Sequence[RowMetadata]
    ) -> np.ndarray:
        values = np.asarray(features, dtype=np.float64)
        if values.ndim != 3 or len(values) != len(metadata):
            raise ContractError("preprocessor requires aligned [N,lookback,channel] panel rows")
        output = np.empty_like(values)
        groups: dict[int, list[int]] = {}
        for index, row in enumerate(metadata):
            groups.setdefault(row.decision_session, []).append(index)
        for indices in groups.values():
            panel = values[indices]
            lower, upper = np.quantile(panel, (0.01, 0.99), axis=0, method="linear")
            clipped = np.clip(panel, lower, upper)
            median = np.median(clipped, axis=0)
            first, third = np.quantile(clipped, (0.25, 0.75), axis=0, method="linear")
            iqr = third - first
            safe_iqr = np.where(iqr < 1e-12, 1.0, iqr)
            output[indices] = (clipped - median) / safe_iqr
        if not np.isfinite(output).all():
            raise ContractError("cross-sectional preprocessing produced a nonfinite value")
        return output.astype(np.float32)


@dataclass
class TrainingResult:
    model: HalalCausalTcnAlpha
    preprocessor: DecisionDateCrossSectionalPreprocessor
    config: TrainingConfig
    losses: tuple[float, ...]
    validation_losses: tuple[float, ...]
    best_epoch: int
    dataset_hash: str
    dataset_class: str
    trusted_lineage_root: str | None
    experiment_config_hash: str
    split_hash: str
    fold_split_hashes: tuple[str, ...]
    verified_folds: tuple[PurgedFold, ...]
    final_train_indices: tuple[int, ...]
    epoch_selection: str
    inner_fold_best_epoch_counts: tuple[int, ...]
    final_epoch_count: int | None
    epochs_trained: int
    promotable: bool


def _seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)


def enforce_sealed_runtime(seed: int = 42) -> dict[str, str]:
    """Configure and attest the one supported deterministic CPU research runtime."""
    _seed_everything(seed)
    actual = {
        "python": platform.python_version(),
        "numpy": str(np.__version__),
        "torch": str(torch.__version__),
        "device": str(torch.get_default_device()),
        "deterministic_algorithms": str(
            torch.are_deterministic_algorithms_enabled()
        ).lower(),
        "torch_threads": str(torch.get_num_threads()),
        "torch_interop_threads": str(torch.get_num_interop_threads()),
    }
    expected = {
        "python": SEALED_PYTHON_VERSION,
        "numpy": SEALED_NUMPY_VERSION,
        "torch": SEALED_TORCH_VERSION,
        "device": "cpu",
        "deterministic_algorithms": "true",
        "torch_threads": "1",
        "torch_interop_threads": "1",
    }
    if actual != expected:
        raise ContractError(
            f"runtime differs from sealed runtime (deterministic CPU): {actual}"
        )
    return actual


def _loss_for_indices(
    model: HalalCausalTcnAlpha,
    features: torch.Tensor,
    beta: torch.Tensor,
    targets: torch.Tensor,
    indices: Sequence[int],
    loss_function: nn.Module,
) -> float:
    model.eval()
    with torch.no_grad():
        chosen = torch.as_tensor(tuple(indices), dtype=torch.long)
        loss = loss_function(model(features[chosen], beta[chosen]), targets[chosen])
    return float(loss.item())


def train_model(
    dataset: FeatureDataset,
    train_indices: Sequence[int],
    validation_indices: Sequence[int],
    config: TrainingConfig | None = None,
    *,
    allow_synthetic: bool = False,
    expected_lineage_root: str | None = None,
) -> TrainingResult:
    validate_dataset(
        dataset,
        require_targets=True,
        allow_synthetic=allow_synthetic,
        expected_lineage_root=expected_lineage_root,
    )
    settings = config or TrainingConfig()
    settings.validate()
    enforce_sealed_runtime(settings.seed)
    if dataset.dataset_class == REAL_PIT:
        raise ContractError(
            "REAL_PIT training blocked: trusted materializer capability unavailable"
        )
    training_rows = tuple(train_indices)
    validation_rows = tuple(validation_indices)
    validate_purged_assignment(dataset.metadata, training_rows, validation_rows)
    actual_split_hash = split_assignment_hash(
        dataset, training_rows, validation_rows
    )

    preprocessor = DecisionDateCrossSectionalPreprocessor()
    features = torch.from_numpy(preprocessor.transform(dataset.features, dataset.metadata))
    beta = torch.as_tensor(dataset.beta, dtype=torch.float32)
    targets = torch.as_tensor(dataset.targets, dtype=torch.float32)
    model = HalalCausalTcnAlpha(ModelConfig(dropout=settings.dropout))
    loss_function = nn.HuberLoss(delta=settings.huber_delta)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=settings.learning_rate,
        weight_decay=settings.weight_decay,
        foreach=False,
    )
    generator = torch.Generator().manual_seed(settings.seed)
    best_state = copy.deepcopy(model.state_dict())
    best_loss = float("inf")
    best_epoch = -1
    stale_epochs = 0
    training_losses: list[float] = []
    validation_losses: list[float] = []
    train_tensor = torch.as_tensor(training_rows, dtype=torch.long)

    for epoch in range(settings.max_epochs):
        model.train()
        shuffled = train_tensor[torch.randperm(len(train_tensor), generator=generator)]
        total = 0.0
        seen = 0
        for start in range(0, len(shuffled), settings.batch_size):
            indices = shuffled[start : start + settings.batch_size]
            optimizer.zero_grad(set_to_none=True)
            loss = loss_function(model(features[indices], beta[indices]), targets[indices])
            if not torch.isfinite(loss):
                raise ContractError("training loss became nonfinite")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), settings.gradient_clip)
            optimizer.step()
            total += float(loss.item()) * len(indices)
            seen += len(indices)
        training_losses.append(total / seen)
        validation_loss = _loss_for_indices(
            model, features, beta, targets, validation_rows, loss_function
        )
        if not np.isfinite(validation_loss):
            raise ContractError("validation loss became nonfinite")
        validation_losses.append(validation_loss)
        if validation_loss < best_loss - settings.min_delta:
            best_loss = validation_loss
            best_epoch = epoch
            best_state = copy.deepcopy(model.state_dict())
            stale_epochs = 0
        else:
            stale_epochs += 1
            if stale_epochs >= settings.patience:
                break

    model.load_state_dict(best_state)
    return TrainingResult(
        model,
        preprocessor,
        settings,
        tuple(training_losses),
        tuple(validation_losses),
        best_epoch,
        dataset.dataset_hash,
        dataset.dataset_class,
        dataset.trusted_lineage_root,
        SEALED_EXPERIMENT_CONFIG_HASH,
        actual_split_hash,
        (actual_split_hash,),
        (PurgedFold(training_rows, validation_rows),),
        tuple(),
        "ONE_FOLD_EARLY_STOP_TEST_ONLY",
        (best_epoch + 1,),
        None,
        len(training_losses),
        # This low-level call observes one validation fold and can never represent a terminal model.
        # A future REAL_PIT materializer/orchestrator must consume five folds and the median rule.
        False,
    )


def predict(
    model: HalalCausalTcnAlpha,
    preprocessor: DecisionDateCrossSectionalPreprocessor,
    dataset: FeatureDataset,
    *,
    allow_synthetic: bool = False,
    expected_lineage_root: str | None = None,
) -> dict[str, float]:
    enforce_sealed_runtime()
    validate_dataset(
        dataset,
        require_targets=False,
        allow_synthetic=allow_synthetic,
        expected_lineage_root=expected_lineage_root,
    )
    if dataset.dataset_class == REAL_PIT:
        raise ContractError(
            "REAL_PIT prediction blocked: trusted materializer capability unavailable"
        )
    model.eval()
    with torch.no_grad():
        features = torch.from_numpy(preprocessor.transform(dataset.features, dataset.metadata))
        beta = torch.as_tensor(dataset.beta, dtype=torch.float32)
        values = model(features, beta).cpu().numpy()
    if not np.isfinite(values).all():
        raise ContractError("inference produced a nonfinite value")
    return {row_hash: float(value) for row_hash, value in zip(dataset.row_hashes, values, strict=True)}


def select_final_epoch_count(inner_fold_best_epoch_counts: Sequence[int]) -> int:
    """Production rule: terminal epoch count is the median of exactly five inner folds."""
    epochs = tuple(inner_fold_best_epoch_counts)
    if len(epochs) != 5 or any(
        not isinstance(epoch, int) or isinstance(epoch, bool) or epoch < 1 or epoch > 64
        for epoch in epochs
    ):
        raise ContractError("final epoch selection requires five integer fold counts in [1,64]")
    return sorted(epochs)[2]


def _retrain_for_fixed_epochs(
    dataset: FeatureDataset,
    train_indices: Sequence[int],
    settings: TrainingConfig,
    epoch_count: int,
) -> tuple[
    HalalCausalTcnAlpha,
    DecisionDateCrossSectionalPreprocessor,
    tuple[float, ...],
]:
    """Train fresh final weights for the already-selected epoch count."""
    enforce_sealed_runtime(settings.seed)
    if dataset.dataset_class == REAL_PIT:
        raise ContractError(
            "REAL_PIT final retraining blocked: trusted materializer capability unavailable"
        )
    if epoch_count < 1 or epoch_count > settings.max_epochs:
        raise ContractError("final retrain epoch count is outside the frozen range")
    indices_tuple = tuple(train_indices)
    if not indices_tuple or len(set(indices_tuple)) != len(indices_tuple):
        raise ContractError("final training rows must be non-empty and unique")
    if min(indices_tuple) < 0 or max(indices_tuple) >= len(dataset.metadata):
        raise ContractError("final training index is out of bounds")
    _seed_everything(settings.seed)
    preprocessor = DecisionDateCrossSectionalPreprocessor()
    features = torch.from_numpy(
        preprocessor.transform(dataset.features, dataset.metadata)
    )
    beta = torch.as_tensor(dataset.beta, dtype=torch.float32)
    targets = torch.as_tensor(dataset.targets, dtype=torch.float32)
    model = HalalCausalTcnAlpha(ModelConfig(dropout=settings.dropout))
    loss_function = nn.HuberLoss(delta=settings.huber_delta)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=settings.learning_rate,
        weight_decay=settings.weight_decay,
        foreach=False,
    )
    generator = torch.Generator().manual_seed(settings.seed)
    train_tensor = torch.as_tensor(indices_tuple, dtype=torch.long)
    losses: list[float] = []
    for _ in range(epoch_count):
        model.train()
        shuffled = train_tensor[
            torch.randperm(len(train_tensor), generator=generator)
        ]
        total = 0.0
        seen = 0
        for start in range(0, len(shuffled), settings.batch_size):
            indices = shuffled[start : start + settings.batch_size]
            optimizer.zero_grad(set_to_none=True)
            loss = loss_function(
                model(features[indices], beta[indices]), targets[indices]
            )
            if not torch.isfinite(loss):
                raise ContractError("final retraining loss became nonfinite")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                model.parameters(), settings.gradient_clip
            )
            optimizer.step()
            total += float(loss.item()) * len(indices)
            seen += len(indices)
        losses.append(total / seen)
    return model, preprocessor, tuple(losses)


def train_five_fold_and_retrain(
    dataset: FeatureDataset,
    folds: Sequence[PurgedFold],
    config: TrainingConfig | None = None,
    *,
    allow_synthetic: bool = False,
    expected_lineage_root: str | None = None,
) -> TrainingResult:
    """Select the median of five fold epochs, then train fresh final weights for it."""
    validate_dataset(
        dataset,
        require_targets=True,
        allow_synthetic=allow_synthetic,
        expected_lineage_root=expected_lineage_root,
    )
    verified_folds = tuple(folds)
    if len(verified_folds) != 5:
        raise ContractError("final orchestration requires exactly five verified folds")
    try:
        frozen_folds = build_frozen_walk_forward_folds(dataset.metadata)
    except ContractError as error:
        raise ContractError(
            "dataset cannot satisfy the frozen walk-forward schedule"
        ) from error
    if verified_folds != frozen_folds:
        raise ContractError(
            "folds differ from the frozen walk-forward 504/126/126-roll policy"
        )
    settings = config or TrainingConfig()
    settings.validate()
    fold_results = tuple(
        train_model(
            dataset,
            fold.train_indices,
            fold.validation_indices,
            settings,
            allow_synthetic=allow_synthetic,
            expected_lineage_root=expected_lineage_root,
        )
        for fold in verified_folds
    )
    fold_epoch_counts = tuple(result.best_epoch + 1 for result in fold_results)
    final_epoch_count = select_final_epoch_count(fold_epoch_counts)
    final_train_indices = tuple(
        sorted(
            {
                index
                for fold in verified_folds
                for index in (*fold.train_indices, *fold.validation_indices)
            }
        )
    )
    final_split_hash = five_fold_assignment_hash(
        dataset, verified_folds, final_train_indices
    )
    model, preprocessor, losses = _retrain_for_fixed_epochs(
        dataset, final_train_indices, settings, final_epoch_count
    )
    return TrainingResult(
        model=model,
        preprocessor=preprocessor,
        config=settings,
        losses=losses,
        validation_losses=tuple(
            loss for result in fold_results for loss in result.validation_losses
        ),
        best_epoch=final_epoch_count - 1,
        dataset_hash=dataset.dataset_hash,
        dataset_class=dataset.dataset_class,
        trusted_lineage_root=dataset.trusted_lineage_root,
        experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
        split_hash=final_split_hash,
        fold_split_hashes=tuple(result.split_hash for result in fold_results),
        verified_folds=verified_folds,
        final_train_indices=final_train_indices,
        epoch_selection="MEDIAN_OF_EXACTLY_FIVE_INNER_FOLDS_FINAL_RETRAIN",
        inner_fold_best_epoch_counts=fold_epoch_counts,
        final_epoch_count=final_epoch_count,
        epochs_trained=len(losses),
        # No independent materializer capability exists yet. All current results fail closed.
        promotable=False,
    )
