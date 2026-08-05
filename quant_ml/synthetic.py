from __future__ import annotations

import numpy as np

from .contracts import (
    FEATURE_NAMES,
    LABEL_SPEC,
    SYNTHETIC_TEST_ONLY,
    FeatureDataset,
    RowMetadata,
    seal_dataset,
)
from .config import SEALED_EXPERIMENT_CONFIG_HASH


def synthetic_panel_dataset(
    decision_count: int = 48, rows_per_decision: int = 1, seed: int = 7
) -> FeatureDataset:
    """Identity-free deterministic fixture. Never a substitute for historical PIT data."""
    if decision_count <= 0 or rows_per_decision <= 0:
        raise ValueError("synthetic panel dimensions must be positive")
    row_count = decision_count * rows_per_decision
    generator = np.random.default_rng(seed)
    features = generator.normal(0.0, 0.2, size=(row_count, 126, 10)).astype(np.float32)
    beta = generator.normal(1.0, 0.1, size=row_count).astype(np.float32)
    targets = (
        0.004 * features[:, -1, 0]
        - 0.003 * features[:, -5:, 1].mean(axis=1)
        + generator.normal(0.0, 0.001, size=row_count)
    ).astype(np.float32)
    metadata: list[RowMetadata] = []
    for index in range(row_count):
        decision = 200 + index // rows_per_decision
        feature_sessions = tuple(range(decision - 125, decision + 1))
        availability = tuple(tuple(session for _ in range(10)) for session in feature_sessions)
        metadata.append(
            RowMetadata(
                decision_session=decision,
                feature_sessions=feature_sessions,
                availability_sessions=availability,
                label_start_session=decision + 1,
                label_end_session=decision + 5,
                source=SYNTHETIC_TEST_ONLY,
                membership="UNKNOWN",
                membership_source="UNKNOWN",
                membership_available_session=None,
                lifecycle="UNKNOWN",
                lifecycle_available_session=None,
                sharia="UNKNOWN",
                sharia_available_session=None,
                corporate_actions_known=False,
            )
        )
    return seal_dataset(
        features,
        beta,
        targets,
        metadata,
        dataset_class=SYNTHETIC_TEST_ONLY,
        feature_names=FEATURE_NAMES,
        label_spec=LABEL_SPEC,
        trusted_lineage_root=None,
        experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
    )


def synthetic_dataset(row_count: int = 48, seed: int = 7) -> FeatureDataset:
    return synthetic_panel_dataset(row_count, 1, seed)
