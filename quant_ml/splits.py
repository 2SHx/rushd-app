from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .config import SEALED_EXPERIMENT_CONFIG_HASH
from .contracts import ContractError, FeatureDataset, RowMetadata, stable_hash


@dataclass(frozen=True)
class PurgedFold:
    train_indices: tuple[int, ...]
    validation_indices: tuple[int, ...]


FROZEN_FOLD_COUNT = 5
FROZEN_MINIMUM_TRAINING_SESSIONS = 504
FROZEN_VALIDATION_SESSIONS = 126
FROZEN_ROLL_SESSIONS = 126
FROZEN_EMBARGO_SESSIONS = 5
FROZEN_LABEL_HORIZON_SESSIONS = 5


def _purged_expanding_folds(
    metadata: Sequence[RowMetadata],
    *,
    minimum_train_sessions: int,
    validation_sessions: int,
    fold_count: int,
    embargo_sessions: int = 5,
) -> tuple[PurgedFold, ...]:
    """Split a panel by unique decision session with the frozen five-session embargo."""
    if (
        minimum_train_sessions <= 0
        or validation_sessions <= 0
        or fold_count <= 0
        or embargo_sessions != FROZEN_EMBARGO_SESSIONS
    ):
        raise ContractError("invalid split controls; the frozen embargo is five sessions")
    groups: list[tuple[int, tuple[int, ...]]] = []
    for index, row in enumerate(metadata):
        if groups and row.decision_session < groups[-1][0]:
            raise ContractError("decision sessions must be grouped in ascending order")
        if groups and row.decision_session == groups[-1][0]:
            groups[-1] = (groups[-1][0], groups[-1][1] + (index,))
        else:
            groups.append((row.decision_session, (index,)))
    if minimum_train_sessions + validation_sessions * fold_count > len(groups):
        raise ContractError("insufficient unique decision sessions for requested expanding folds")

    folds: list[PurgedFold] = []
    for fold_index in range(fold_count):
        validation_begin = minimum_train_sessions + fold_index * validation_sessions
        validation_groups = groups[
            validation_begin : validation_begin + validation_sessions
        ]
        validation_indices = tuple(
            index for _, indices in validation_groups for index in indices
        )
        first_validation_session = validation_groups[0][0]
        eligible_groups = (
            indices
            for _, indices in groups[:validation_begin]
            if all(
                metadata[index].label_end_session
                < first_validation_session - embargo_sessions
                for index in indices
            )
        )
        train_indices = tuple(index for indices in eligible_groups for index in indices)
        if not train_indices:
            raise ContractError("purging removed every training row")
        if any(
            metadata[index].label_end_session
            >= first_validation_session - embargo_sessions
            for index in train_indices
        ):
            raise AssertionError("label-overlap purge failed")
        folds.append(PurgedFold(train_indices, validation_indices))
    return tuple(folds)


def build_frozen_walk_forward_folds(
    metadata: Sequence[RowMetadata],
) -> tuple[PurgedFold, ...]:
    """Only production fold policy: 5 × 126-date validation after 504 eligible dates."""
    pre_validation_dates = (
        FROZEN_MINIMUM_TRAINING_SESSIONS
        + FROZEN_LABEL_HORIZON_SESSIONS
        + FROZEN_EMBARGO_SESSIONS
    )
    folds = _purged_expanding_folds(
        metadata,
        minimum_train_sessions=pre_validation_dates,
        validation_sessions=FROZEN_VALIDATION_SESSIONS,
        fold_count=FROZEN_FOLD_COUNT,
        embargo_sessions=FROZEN_EMBARGO_SESSIONS,
    )
    if len(folds) != FROZEN_FOLD_COUNT:
        raise AssertionError("frozen walk-forward fold count changed")
    for fold in folds:
        train_dates = {metadata[index].decision_session for index in fold.train_indices}
        validation_dates = {
            metadata[index].decision_session for index in fold.validation_indices
        }
        if len(train_dates) < FROZEN_MINIMUM_TRAINING_SESSIONS:
            raise ContractError("frozen fold has fewer than 504 eligible training sessions")
        if len(validation_dates) != FROZEN_VALIDATION_SESSIONS:
            raise ContractError("frozen fold must contain 126 validation sessions")
    return folds


def validate_purged_assignment(
    metadata: Sequence[RowMetadata],
    train_indices: Sequence[int],
    validation_indices: Sequence[int],
) -> None:
    """Validate row bounds, date grouping, label purge, and frozen embargo at entry."""
    training = tuple(train_indices)
    validation = tuple(validation_indices)
    if not training or not validation or len(set(training)) != len(training) or len(
        set(validation)
    ) != len(validation):
        raise ContractError("non-empty unique training and validation rows are required")
    if set(training) & set(validation):
        raise ContractError("training and validation rows must be disjoint")
    row_count = len(metadata)
    if min((*training, *validation)) < 0 or max((*training, *validation)) >= row_count:
        raise ContractError("training or validation index is out of bounds")
    training_dates = {metadata[index].decision_session for index in training}
    validation_dates = {metadata[index].decision_session for index in validation}
    if training_dates & validation_dates:
        raise ContractError("training and validation decision sessions must be disjoint")
    first_validation_session = min(validation_dates)
    if any(
        metadata[index].label_end_session
        >= first_validation_session - FROZEN_EMBARGO_SESSIONS
        for index in training
    ):
        raise ContractError("training labels violate chronological purge plus five-session embargo")


def split_assignment_hash(
    dataset: FeatureDataset,
    train_indices: Sequence[int],
    validation_indices: Sequence[int],
) -> str:
    validate_purged_assignment(dataset.metadata, train_indices, validation_indices)
    return stable_hash(
        {
            "schema_version": 2,
            "experiment_config_hash": SEALED_EXPERIMENT_CONFIG_HASH,
            "dataset_hash": dataset.dataset_hash,
            "train_row_hashes": [dataset.row_hashes[index] for index in train_indices],
            "validation_row_hashes": [
                dataset.row_hashes[index] for index in validation_indices
            ],
        }
    )


def five_fold_assignment_hash(
    dataset: FeatureDataset,
    folds: Sequence[PurgedFold],
    final_train_indices: Sequence[int],
) -> str:
    if len(folds) != FROZEN_FOLD_COUNT:
        raise ContractError("final orchestration requires exactly five verified folds")
    fold_hashes = []
    for fold in folds:
        fold_hashes.append(
            split_assignment_hash(
                dataset, fold.train_indices, fold.validation_indices
            )
        )
    final_indices = tuple(final_train_indices)
    if not final_indices or len(set(final_indices)) != len(final_indices):
        raise ContractError("final training rows must be non-empty and unique")
    if min(final_indices) < 0 or max(final_indices) >= len(dataset.metadata):
        raise ContractError("final training index is out of bounds")
    return stable_hash(
        {
            "schema_version": 2,
            "experiment_config_hash": SEALED_EXPERIMENT_CONFIG_HASH,
            "dataset_hash": dataset.dataset_hash,
            "fold_split_hashes": fold_hashes,
            "final_train_row_hashes": [
                dataset.row_hashes[index] for index in final_indices
            ],
        }
    )
