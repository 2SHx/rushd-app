from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from typing import Any, Mapping, Sequence

import numpy as np

from .config import ModelConfig, SEALED_EXPERIMENT_CONFIG_HASH

FEATURE_NAMES = (
    "stock_minus_spus_log_return_1d",
    "spus_log_return_1d",
    "overnight_gap",
    "intraday_return",
    "true_range",
    "realized_volatility_21d",
    "downside_volatility_21d",
    "drawdown_63d",
    "dollar_volume_over_trailing_63d_median",
    "pit_liquidity_percentile",
)
LABEL_SPEC = {
    "version": "halal-causal-tcn-alpha-label-v1",
    "horizon_observed_sessions": 5,
    "entry": "next-observed-open",
    "exit": "fifth-subsequent-observed-close",
    "target": "stock_log_total_return_minus_clipped_beta_times_spus_log_total_return_minus_0.003",
}
REAL_PIT = "REAL_PIT"
SYNTHETIC_TEST_ONLY = "SYNTHETIC_TEST_ONLY"


class ContractError(ValueError):
    """Fail-closed feature, label, PIT, or hash contract violation."""


def _canonical(value: Any) -> Any:
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        number = float(value)
        if not math.isfinite(number):
            raise ContractError("canonical JSON accepts finite values only")
        return number
    if isinstance(value, np.ndarray):
        return _canonical(value.tolist())
    if isinstance(value, (list, tuple)):
        return [_canonical(item) for item in value]
    if isinstance(value, Mapping):
        if not all(isinstance(key, str) for key in value):
            raise ContractError("canonical JSON object keys must be strings")
        return {key: _canonical(value[key]) for key in sorted(value)}
    raise ContractError(f"unsupported canonical JSON value: {type(value).__name__}")


def canonical_json(value: Any) -> str:
    return json.dumps(
        _canonical(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


def stable_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class RowMetadata:
    decision_session: int
    feature_sessions: tuple[int, ...]
    availability_sessions: tuple[tuple[int, ...], ...]
    label_start_session: int
    label_end_session: int
    source: str = "UNKNOWN"
    membership: str = "UNKNOWN"
    membership_source: str = "UNKNOWN"
    membership_available_session: int | None = None
    lifecycle: str = "UNKNOWN"
    lifecycle_available_session: int | None = None
    sharia: str = "UNKNOWN"
    sharia_available_session: int | None = None
    corporate_actions_known: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class FeatureDataset:
    features: np.ndarray
    beta: np.ndarray
    # Numeric target correctness is materializer-owned; it cannot be inferred from tensors.
    # No REAL_PIT materializer exists yet, so production training remains blocked.
    targets: np.ndarray | None
    metadata: tuple[RowMetadata, ...]
    row_hashes: tuple[str, ...]
    dataset_hash: str
    dataset_class: str
    feature_names: tuple[str, ...]
    label_spec: dict[str, Any]
    trusted_lineage_root: str | None
    experiment_config_hash: str


def row_payload(
    features: np.ndarray,
    beta: float,
    target: float | None,
    metadata: RowMetadata,
    dataset_class: str,
    feature_names: Sequence[str],
    label_spec: Mapping[str, Any],
    trusted_lineage_root: str | None,
    experiment_config_hash: str,
) -> dict[str, Any]:
    return {
        "features": features,
        "beta": beta,
        "target": target,
        "metadata": metadata.to_dict(),
        "dataset_class": dataset_class,
        "feature_names": list(feature_names),
        "label_spec": label_spec,
        "trusted_lineage_root": trusted_lineage_root,
        "experiment_config_hash": experiment_config_hash,
    }


def compute_row_hash(
    features: np.ndarray,
    beta: float,
    target: float | None,
    metadata: RowMetadata,
    dataset_class: str,
    feature_names: Sequence[str],
    label_spec: Mapping[str, Any],
    trusted_lineage_root: str | None,
    experiment_config_hash: str,
) -> str:
    return stable_hash(
        row_payload(
            features,
            beta,
            target,
            metadata,
            dataset_class,
            feature_names,
            label_spec,
            trusted_lineage_root,
            experiment_config_hash,
        )
    )


def compute_dataset_hash(
    row_hashes: Sequence[str],
    dataset_class: str,
    feature_names: Sequence[str],
    label_spec: Mapping[str, Any],
    trusted_lineage_root: str | None,
    experiment_config_hash: str,
) -> str:
    return stable_hash(
        {
            "schema_version": 2,
            "ordered_row_hashes": list(row_hashes),
            "dataset_class": dataset_class,
            "feature_names": list(feature_names),
            "label_spec": label_spec,
            "trusted_lineage_root": trusted_lineage_root,
            "experiment_config_hash": experiment_config_hash,
        }
    )


def seal_dataset(
    features: np.ndarray,
    beta: np.ndarray,
    targets: np.ndarray | None,
    metadata: Sequence[RowMetadata],
    *,
    dataset_class: str,
    feature_names: Sequence[str],
    label_spec: Mapping[str, Any],
    trusted_lineage_root: str | None,
    experiment_config_hash: str = SEALED_EXPERIMENT_CONFIG_HASH,
) -> FeatureDataset:
    rows = tuple(metadata)
    hashes = tuple(
        compute_row_hash(
            features[index],
            float(beta[index]),
            None if targets is None else float(targets[index]),
            rows[index],
            dataset_class,
            feature_names,
            label_spec,
            trusted_lineage_root,
            experiment_config_hash,
        )
        for index in range(len(rows))
    )
    names = tuple(feature_names)
    spec = dict(label_spec)
    return FeatureDataset(
        features,
        beta,
        targets,
        rows,
        hashes,
        compute_dataset_hash(
            hashes,
            dataset_class,
            names,
            spec,
            trusted_lineage_root,
            experiment_config_hash,
        ),
        dataset_class,
        names,
        spec,
        trusted_lineage_root,
        experiment_config_hash,
    )


def _validate_metadata(row: RowMetadata, config: ModelConfig, dataset_class: str) -> None:
    session_values = (
        row.decision_session,
        row.label_start_session,
        row.label_end_session,
        *row.feature_sessions,
        *(time for times in row.availability_sessions for time in times),
    )
    if any(not isinstance(value, int) or isinstance(value, bool) for value in session_values):
        raise ContractError("session metadata must contain integers only")
    if dataset_class == REAL_PIT:
        if row.source != "REAL":
            raise ContractError("MOCK, synthetic, or non-REAL rows are forbidden in REAL_PIT")
        if row.membership != "IN" or row.membership_source != "PIT_SNAPSHOT":
            raise ContractError("membership must be known from a point-in-time snapshot, not a current sleeve")
        if row.lifecycle != "ACTIVE":
            raise ContractError("lifecycle must be known and ACTIVE")
        if row.sharia != "VERIFIED_COMPLIANT":
            raise ContractError("Sharia evidence must be known and verified compliant")
        if not row.corporate_actions_known:
            raise ContractError("corporate-action state must be known")
        evidence_times = (
            row.membership_available_session,
            row.lifecycle_available_session,
            row.sharia_available_session,
        )
        if any(not isinstance(time, int) or isinstance(time, bool) for time in evidence_times):
            raise ContractError("REAL_PIT evidence availability must be explicit")
        if any(time > row.decision_session for time in evidence_times):
            raise ContractError("membership/lifecycle/Sharia evidence was unavailable at decision time")
    elif dataset_class == SYNTHETIC_TEST_ONLY:
        synthetic_lineage = (
            row.source == SYNTHETIC_TEST_ONLY
            and row.membership == "UNKNOWN"
            and row.membership_source == "UNKNOWN"
            and row.membership_available_session is None
            and row.lifecycle == "UNKNOWN"
            and row.lifecycle_available_session is None
            and row.sharia == "UNKNOWN"
            and row.sharia_available_session is None
            and not row.corporate_actions_known
        )
        if not synthetic_lineage:
            raise ContractError("synthetic rows must carry non-claiming UNKNOWN lineage")
    else:
        raise ContractError("unknown dataset class")
    if len(row.feature_sessions) != config.sessions:
        raise ContractError("wrong feature-session shape")
    if len(row.availability_sessions) != config.sessions or any(
        len(times) != config.channels for times in row.availability_sessions
    ):
        raise ContractError("wrong availability shape")
    if any(left >= right for left, right in zip(row.feature_sessions, row.feature_sessions[1:])):
        raise ContractError("feature sessions must be strictly ascending and unique")
    if row.feature_sessions[-1] != row.decision_session:
        raise ContractError("future feature bar detected: feature sessions must end at decision session")
    if any(
        time > row.decision_session
        for session_times in row.availability_sessions
        for time in session_times
    ):
        raise ContractError("feature unavailable at decision time")
    if (
        row.label_start_session != row.decision_session + 1
        or row.label_end_session != row.decision_session + 5
    ):
        raise ContractError("label must span exactly decision+1 through decision+5")


def validate_dataset(
    dataset: FeatureDataset,
    require_targets: bool = True,
    *,
    allow_synthetic: bool = False,
    expected_lineage_root: str | None = None,
) -> None:
    config = ModelConfig()
    config.validate()
    features = np.asarray(dataset.features)
    beta = np.asarray(dataset.beta)
    count = len(dataset.metadata)
    if tuple(dataset.feature_names) != FEATURE_NAMES:
        raise ContractError("feature names/order differ from the frozen contract")
    if dataset.label_spec != LABEL_SPEC:
        raise ContractError("label specification/version differs from the frozen contract")
    if dataset.experiment_config_hash != SEALED_EXPERIMENT_CONFIG_HASH:
        raise ContractError("dataset experiment configuration differs from the sealed manifest")
    if dataset.dataset_class == SYNTHETIC_TEST_ONLY:
        if not allow_synthetic:
            raise ContractError("synthetic data requires explicit allow_synthetic=True")
        if dataset.trusted_lineage_root is not None:
            raise ContractError("synthetic data cannot carry a trusted real-data lineage root")
    elif dataset.dataset_class == REAL_PIT:
        if not _is_sha256(dataset.trusted_lineage_root):
            raise ContractError("REAL_PIT requires an externally trusted 64-hex lineage root")
        if not _is_sha256(expected_lineage_root):
            raise ContractError("REAL_PIT requires a separate externally expected lineage root")
        if dataset.trusted_lineage_root != expected_lineage_root:
            raise ContractError("REAL_PIT lineage root does not match the external authority")
    else:
        raise ContractError("unknown dataset class")
    if count == 0 or features.shape != (count, config.sessions, config.channels):
        raise ContractError("features must have shape [N,126,10] with N > 0")
    if beta.shape != (count,):
        raise ContractError("beta must have shape [N]")
    if require_targets and dataset.targets is None:
        raise ContractError("training labels are required")
    if dataset.targets is not None and np.asarray(dataset.targets).shape != (count,):
        raise ContractError("targets must have shape [N]")
    arrays = [features, beta]
    if dataset.targets is not None:
        arrays.append(np.asarray(dataset.targets))
    if any(not np.issubdtype(array.dtype, np.number) or not np.isrealobj(array) for array in arrays):
        raise ContractError("real numeric arrays are required")
    if any(not np.isfinite(array).all() for array in arrays):
        raise ContractError("missing or nonfinite numeric value")
    if np.any(beta < 0) or np.any(beta > 2):
        raise ContractError("beta must be in the inclusive range [0,2]")
    if len(dataset.row_hashes) != count or len(set(dataset.row_hashes)) != count:
        raise ContractError("row hashes must be present and unique")
    for index, row in enumerate(dataset.metadata):
        _validate_metadata(row, config, dataset.dataset_class)
        expected = compute_row_hash(
            features[index],
            float(beta[index]),
            None if dataset.targets is None else float(dataset.targets[index]),
            row,
            dataset.dataset_class,
            dataset.feature_names,
            dataset.label_spec,
            dataset.trusted_lineage_root,
            dataset.experiment_config_hash,
        )
        if dataset.row_hashes[index] != expected:
            raise ContractError("row data/hash mismatch")
    if dataset.dataset_hash != compute_dataset_hash(
        dataset.row_hashes,
        dataset.dataset_class,
        dataset.feature_names,
        dataset.label_spec,
        dataset.trusted_lineage_root,
        dataset.experiment_config_hash,
    ):
        raise ContractError("dataset hash mismatch")


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(
        character in "0123456789abcdef" for character in value
    )
