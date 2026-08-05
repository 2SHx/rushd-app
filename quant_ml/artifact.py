from __future__ import annotations

import hashlib
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import torch

from .config import (
    MODEL_ID,
    MODEL_VERSION,
    SEALED_EXPERIMENT_CONFIG_HASH,
    ModelConfig,
    TrainingConfig,
)
from .contracts import (
    FEATURE_NAMES,
    LABEL_SPEC,
    REAL_PIT,
    ContractError,
    FeatureDataset,
    canonical_json,
    stable_hash,
    validate_dataset,
)
from .model import EXPECTED_PARAMETER_COUNT, HalalCausalTcnAlpha, parameter_count
from .splits import (
    build_frozen_walk_forward_folds,
    five_fold_assignment_hash,
    split_assignment_hash,
)
from .training import (
    PREPROCESSOR_CONTRACT,
    DecisionDateCrossSectionalPreprocessor,
    TrainingResult,
    enforce_sealed_runtime,
    select_final_epoch_count,
)


@dataclass(frozen=True)
class ArtifactHashes:
    metadata_sha256: str
    state_sha256: str
    manifest_sha256: str


@dataclass(frozen=True)
class LoadedArtifact:
    model: HalalCausalTcnAlpha
    preprocessor: DecisionDateCrossSectionalPreprocessor
    metadata: dict[str, Any]
    hashes: ArtifactHashes


ARTIFACT_SCHEMA = {
    "schema_version": 3,
    "input_shape": [126, 10],
    "feature_names": list(FEATURE_NAMES),
    "label_spec": LABEL_SPEC,
    "beta_shape": [],
    "prediction_entry": ["row_hash", "prediction"],
    "identity_fields": [],
}


def runtime_versions() -> dict[str, str]:
    return enforce_sealed_runtime()


def quant_ml_code_hash() -> str:
    root = Path(__file__).resolve().parent
    files = sorted(
        path for path in root.glob("*.py") if path.name != "__pycache__"
    )
    return stable_hash(
        [{"path": path.name, "sha256": sha256_file(path)} for path in files]
    )


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(
        character in "0123456789abcdef" for character in value
    )


def _verify_expected_lineage(
    dataset_class: Any,
    recorded_lineage_root: Any,
    expected_lineage_root: str | None,
) -> None:
    if dataset_class == REAL_PIT:
        if not _is_sha256(recorded_lineage_root) or not _is_sha256(
            expected_lineage_root
        ):
            raise ContractError("REAL_PIT artifact requires an external expected lineage root")
        if recorded_lineage_root != expected_lineage_root:
            raise ContractError("artifact lineage root differs from the external authority")
    elif expected_lineage_root is not None:
        raise ContractError("non-REAL artifact cannot consume a real-data lineage authority")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_canonical(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(canonical_json(value) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _read_json(path: Path) -> dict[str, Any]:
    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        value: dict[str, Any] = {}
        for key, item in pairs:
            if key in value:
                raise ContractError(f"duplicate JSON key in {path.name}")
            value[key] = item
        return value

    try:
        parsed = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=reject_duplicates)
    except (OSError, json.JSONDecodeError) as error:
        raise ContractError(f"invalid JSON artifact: {path.name}") from error
    if not isinstance(parsed, dict):
        raise ContractError(f"{path.name} must contain a JSON object")
    return parsed


def save_artifact(
    directory: Path,
    result: TrainingResult,
    dataset: FeatureDataset,
    *,
    expected_experiment_config_hash: str,
    expected_lineage_root: str | None = None,
) -> ArtifactHashes:
    if expected_experiment_config_hash != SEALED_EXPERIMENT_CONFIG_HASH:
        raise ContractError("artifact save requires the sealed experiment configuration")
    runtime = runtime_versions()
    validate_dataset(
        dataset,
        allow_synthetic=not result.promotable,
        expected_lineage_root=expected_lineage_root,
    )
    if (
        dataset.dataset_hash != result.dataset_hash
        or dataset.dataset_class != result.dataset_class
        or dataset.trusted_lineage_root != result.trusted_lineage_root
        or result.experiment_config_hash != SEALED_EXPERIMENT_CONFIG_HASH
    ):
        raise ContractError("training result and dataset provenance mismatch")
    if dataset.dataset_class == REAL_PIT or result.promotable:
        raise ContractError(
            "REAL_PIT artifact promotion blocked: trusted materializer capability unavailable"
        )
    if not _is_sha256(result.split_hash) or not result.fold_split_hashes or any(
        not _is_sha256(value) for value in result.fold_split_hashes
    ):
        raise ContractError("training result lacks computed split roots")
    if result.epoch_selection == "MEDIAN_OF_EXACTLY_FIVE_INNER_FOLDS_FINAL_RETRAIN":
        try:
            frozen_folds = build_frozen_walk_forward_folds(dataset.metadata)
        except ContractError as error:
            raise ContractError(
                "artifact lacks the frozen walk-forward schedule"
            ) from error
        if result.verified_folds != frozen_folds:
            raise ContractError(
                "artifact folds differ from the frozen walk-forward schedule"
            )
        computed_fold_hashes = tuple(
            split_assignment_hash(
                dataset, fold.train_indices, fold.validation_indices
            )
            for fold in result.verified_folds
        )
        computed_split_hash = five_fold_assignment_hash(
            dataset, result.verified_folds, result.final_train_indices
        )
        selected = select_final_epoch_count(result.inner_fold_best_epoch_counts)
        if (
            result.fold_split_hashes != computed_fold_hashes
            or result.split_hash != computed_split_hash
            or result.final_epoch_count != selected
            or result.epochs_trained != selected
        ):
            raise ContractError("final weights were not trained for the median-five epoch count")
    elif result.epoch_selection == "ONE_FOLD_EARLY_STOP_TEST_ONLY":
        if len(result.verified_folds) != 1:
            raise ContractError("one-fold artifact must carry its verified assignment")
        fold = result.verified_folds[0]
        computed_split_hash = split_assignment_hash(
            dataset, fold.train_indices, fold.validation_indices
        )
        if (
            result.promotable
            or result.final_epoch_count is not None
            or len(result.inner_fold_best_epoch_counts) != 1
            or result.final_train_indices
            or result.fold_split_hashes != (computed_split_hash,)
            or result.split_hash != computed_split_hash
        ):
            raise ContractError("one-fold weights must remain explicitly non-promotable")
    else:
        raise ContractError("unknown training epoch-selection contract")
    if result.promotable and (
        result.dataset_class != REAL_PIT
        or result.epoch_selection
        != "MEDIAN_OF_EXACTLY_FIVE_INNER_FOLDS_FINAL_RETRAIN"
    ):
        raise ContractError("promotable artifacts require REAL_PIT five-fold final retraining")

    directory.mkdir(parents=True, exist_ok=True)
    state_path = directory / "model.pt"
    metadata_path = directory / "metadata.json"
    manifest_path = directory / "manifest.json"
    torch.save(result.model.state_dict(), state_path)
    state_hash = sha256_file(state_path)
    model_config = result.model.config.to_dict()
    training_config = result.config.to_dict()
    model_training_config_hash = stable_hash(
        {"model_config": model_config, "training_config": training_config}
    )
    code_hash = quant_ml_code_hash()
    metadata = {
        "schema_version": 3,
        "schema_hash": stable_hash(ARTIFACT_SCHEMA),
        "code_hash": code_hash,
        "model_id": MODEL_ID,
        "model_version": MODEL_VERSION,
        "model_config": model_config,
        "model_config_hash": stable_hash(model_config),
        "training_config": training_config,
        "experiment_config_hash": SEALED_EXPERIMENT_CONFIG_HASH,
        "model_training_config_hash": model_training_config_hash,
        "parameter_count": parameter_count(result.model),
        "state_sha256": state_hash,
        "data_hash": dataset.dataset_hash,
        "split_hash": result.split_hash,
        "fold_split_hashes": list(result.fold_split_hashes),
        "preprocessor_contract": PREPROCESSOR_CONTRACT,
        "preprocessor_hash": result.preprocessor.contract_hash,
        "feature_names": list(dataset.feature_names),
        "feature_names_hash": stable_hash(dataset.feature_names),
        "label_spec": dataset.label_spec,
        "label_spec_hash": stable_hash(dataset.label_spec),
        "dataset_class": dataset.dataset_class,
        "trusted_lineage_root": dataset.trusted_lineage_root,
        "promotable": result.promotable,
        "epoch_selection": result.epoch_selection,
        "inner_fold_best_epoch_counts": list(result.inner_fold_best_epoch_counts),
        "final_epoch_count": result.final_epoch_count,
        "epochs_trained": result.epochs_trained,
        "runtime": runtime,
        "runtime_hash": stable_hash(runtime),
        "output_contract": "identity-free predictions keyed only by row_hash",
    }
    metadata["model_hash"] = stable_hash(
        {
            "model_id": MODEL_ID,
            "model_version": MODEL_VERSION,
            "experiment_config_hash": SEALED_EXPERIMENT_CONFIG_HASH,
            "model_training_config_hash": model_training_config_hash,
            "state_sha256": state_hash,
        }
    )
    _write_canonical(metadata_path, metadata)
    metadata_hash = sha256_file(metadata_path)
    manifest = {
        "schema_version": 3,
        "files": {"metadata.json": metadata_hash, "model.pt": state_hash},
    }
    _write_canonical(manifest_path, manifest)
    return ArtifactHashes(metadata_hash, state_hash, sha256_file(manifest_path))


def load_artifact(
    directory: Path,
    *,
    expected_hashes: ArtifactHashes,
    expected_data_hash: str,
    expected_split_hash: str,
    expected_preprocessor_hash: str,
    expected_experiment_config_hash: str,
    expected_lineage_root: str | None = None,
) -> LoadedArtifact:
    if not all(
        _is_sha256(value)
        for value in (expected_data_hash, expected_split_hash, expected_preprocessor_hash)
    ):
        raise ContractError("trusted artifact roots must be SHA-256")
    if expected_experiment_config_hash != SEALED_EXPERIMENT_CONFIG_HASH:
        raise ContractError("artifact load requires the sealed experiment configuration")
    state_path = directory / "model.pt"
    metadata_path = directory / "metadata.json"
    manifest_path = directory / "manifest.json"
    manifest = _read_json(manifest_path)
    files = manifest.get("files")
    if manifest.get("schema_version") != 3 or not isinstance(files, dict) or set(files) != {
        "metadata.json", "model.pt"
    }:
        raise ContractError("invalid artifact manifest")
    actual = ArtifactHashes(sha256_file(metadata_path), sha256_file(state_path), sha256_file(manifest_path))
    if actual != expected_hashes:
        raise ContractError("artifact bundle differs from trusted hashes")
    if files != {"metadata.json": actual.metadata_sha256, "model.pt": actual.state_sha256}:
        raise ContractError("artifact manifest file hash mismatch")
    metadata = _read_json(metadata_path)
    required_hashes = {
        "schema_hash": stable_hash(ARTIFACT_SCHEMA),
        "code_hash": quant_ml_code_hash(),
        "data_hash": expected_data_hash,
        "split_hash": expected_split_hash,
        "preprocessor_hash": expected_preprocessor_hash,
        "feature_names_hash": stable_hash(FEATURE_NAMES),
        "label_spec_hash": stable_hash(LABEL_SPEC),
        "runtime_hash": stable_hash(runtime_versions()),
        "state_sha256": actual.state_sha256,
        "experiment_config_hash": SEALED_EXPERIMENT_CONFIG_HASH,
    }
    if metadata.get("schema_version") != 3 or any(
        metadata.get(key) != value for key, value in required_hashes.items()
    ):
        raise ContractError("artifact provenance hash mismatch")
    if metadata.get("dataset_class") == REAL_PIT or metadata.get("promotable"):
        raise ContractError(
            "REAL_PIT artifact load blocked: trusted materializer capability unavailable"
        )
    _verify_expected_lineage(
        metadata.get("dataset_class"),
        metadata.get("trusted_lineage_root"),
        expected_lineage_root,
    )
    if metadata.get("feature_names") != list(FEATURE_NAMES) or metadata.get("label_spec") != LABEL_SPEC:
        raise ContractError("artifact feature/label semantics mismatch")
    if metadata.get("preprocessor_contract") != PREPROCESSOR_CONTRACT:
        raise ContractError("artifact preprocessor contract mismatch")
    if metadata.get("runtime") != runtime_versions():
        raise ContractError("artifact runtime mismatch")
    if metadata.get("parameter_count") != EXPECTED_PARAMETER_COUNT:
        raise ContractError("artifact parameter count mismatch")
    model_config_data = metadata.get("model_config")
    training_config_data = metadata.get("training_config")
    if not isinstance(model_config_data, dict) or not isinstance(training_config_data, dict):
        raise ContractError("artifact config missing")
    if metadata.get("model_config_hash") != stable_hash(model_config_data) or metadata.get(
        "model_training_config_hash"
    ) != stable_hash({"model_config": model_config_data, "training_config": training_config_data}):
        raise ContractError("artifact config hash mismatch")
    TrainingConfig(**training_config_data).validate()
    model_config = ModelConfig(**{**model_config_data, "dilations": tuple(model_config_data.get("dilations", ()))})
    model_config.validate()
    expected_model_hash = stable_hash(
        {
            "model_id": MODEL_ID,
            "model_version": MODEL_VERSION,
            "experiment_config_hash": metadata["experiment_config_hash"],
            "model_training_config_hash": metadata["model_training_config_hash"],
            "state_sha256": actual.state_sha256,
        }
    )
    if metadata.get("model_hash") != expected_model_hash:
        raise ContractError("artifact model hash mismatch")
    if metadata.get("promotable"):
        selected = select_final_epoch_count(metadata.get("inner_fold_best_epoch_counts", ()))
        if metadata.get("final_epoch_count") != selected or metadata.get(
            "epochs_trained"
        ) != selected:
            raise ContractError("artifact final epoch selection mismatch")
    elif metadata.get("epoch_selection") == "ONE_FOLD_EARLY_STOP_TEST_ONLY":
        if metadata.get("final_epoch_count") is not None:
            raise ContractError("one-fold artifact cannot claim a final epoch count")
    elif metadata.get("epoch_selection") == "MEDIAN_OF_EXACTLY_FIVE_INNER_FOLDS_FINAL_RETRAIN":
        selected = select_final_epoch_count(metadata.get("inner_fold_best_epoch_counts", ()))
        if metadata.get("final_epoch_count") != selected or metadata.get(
            "epochs_trained"
        ) != selected:
            raise ContractError("non-promotable final-retrain artifact epoch mismatch")
    else:
        raise ContractError("artifact epoch contract mismatch")
    model = HalalCausalTcnAlpha(model_config)
    try:
        model.load_state_dict(torch.load(state_path, map_location="cpu", weights_only=True), strict=True)
    except Exception as error:
        raise ContractError("invalid artifact state") from error
    model.eval()
    return LoadedArtifact(model, DecisionDateCrossSectionalPreprocessor(), metadata, actual)


def _prediction_header(dataset: FeatureDataset, artifact: LoadedArtifact) -> dict[str, Any]:
    metadata = artifact.metadata
    return {
        "schema_version": 3,
        "schema_hash": metadata["schema_hash"],
        "code_hash": metadata["code_hash"],
        "model_id": MODEL_ID,
        "model_version": MODEL_VERSION,
        "model_hash": metadata["model_hash"],
        "experiment_config_hash": metadata["experiment_config_hash"],
        "model_training_config_hash": metadata["model_training_config_hash"],
        "data_hash": dataset.dataset_hash,
        "state_hash": artifact.hashes.state_sha256,
        "preprocessor_hash": metadata["preprocessor_hash"],
        "runtime_hash": metadata["runtime_hash"],
        "split_hash": metadata["split_hash"],
        "feature_names_hash": metadata["feature_names_hash"],
        "label_spec_hash": metadata["label_spec_hash"],
        "promotable": metadata["promotable"],
    }


def save_prediction_artifact(
    path: Path,
    predictions: Mapping[str, float],
    dataset: FeatureDataset,
    artifact: LoadedArtifact,
    *,
    expected_experiment_config_hash: str,
    allow_synthetic: bool = False,
    expected_lineage_root: str | None = None,
) -> str:
    if expected_experiment_config_hash != SEALED_EXPERIMENT_CONFIG_HASH:
        raise ContractError("prediction save requires the sealed experiment configuration")
    if artifact.metadata.get("dataset_class") == REAL_PIT or artifact.metadata.get(
        "promotable"
    ):
        raise ContractError(
            "REAL_PIT prediction save blocked: trusted materializer capability unavailable"
        )
    validate_dataset(
        dataset,
        require_targets=False,
        allow_synthetic=allow_synthetic,
        expected_lineage_root=expected_lineage_root,
    )
    if (
        artifact.metadata.get("data_hash") != dataset.dataset_hash
        or artifact.metadata.get("experiment_config_hash")
        != SEALED_EXPERIMENT_CONFIG_HASH
    ):
        raise ContractError("prediction inputs differ from the loaded artifact provenance")
    if list(predictions) != list(dataset.row_hashes):
        raise ContractError("prediction keys must match ordered dataset row hashes")
    entries: list[dict[str, Any]] = []
    for row_hash, prediction in predictions.items():
        if isinstance(prediction, bool) or not isinstance(prediction, (int, float)) or not math.isfinite(float(prediction)):
            raise ContractError("predictions must be finite real scalars")
        entries.append({"row_hash": row_hash, "prediction": float(prediction)})
    payload = {
        **_prediction_header(dataset, artifact),
        "entries": entries,
        "predictions_hash": stable_hash(entries),
    }
    _write_canonical(path, {"payload": payload, "payload_hash": stable_hash(payload)})
    return sha256_file(path)


def load_prediction_artifact(
    path: Path,
    dataset: FeatureDataset,
    artifact: LoadedArtifact,
    *,
    expected_sha256: str,
    expected_data_hash: str,
    expected_split_hash: str,
    expected_preprocessor_hash: str,
    expected_experiment_config_hash: str,
    allow_synthetic: bool = False,
    expected_lineage_root: str | None = None,
) -> dict[str, float]:
    if expected_experiment_config_hash != SEALED_EXPERIMENT_CONFIG_HASH:
        raise ContractError("prediction load requires the sealed experiment configuration")
    if artifact.metadata.get("dataset_class") == REAL_PIT or artifact.metadata.get(
        "promotable"
    ):
        raise ContractError(
            "REAL_PIT prediction load blocked: trusted materializer capability unavailable"
        )
    validate_dataset(
        dataset,
        require_targets=False,
        allow_synthetic=allow_synthetic,
        expected_lineage_root=expected_lineage_root,
    )
    if not all(_is_sha256(value) for value in (
        expected_sha256, expected_data_hash, expected_split_hash, expected_preprocessor_hash
    )):
        raise ContractError("trusted prediction roots must be SHA-256")
    if sha256_file(path) != expected_sha256:
        raise ContractError("prediction artifact differs from trusted hash")
    envelope = _read_json(path)
    if set(envelope) != {"payload", "payload_hash"} or not isinstance(envelope.get("payload"), dict):
        raise ContractError("invalid prediction artifact envelope")
    payload = envelope["payload"]
    if envelope.get("payload_hash") != stable_hash(payload):
        raise ContractError("prediction artifact payload hash mismatch")
    expected_header = _prediction_header(dataset, artifact)
    if (
        expected_data_hash != dataset.dataset_hash
        or expected_split_hash != artifact.metadata["split_hash"]
        or expected_preprocessor_hash != artifact.metadata["preprocessor_hash"]
        or any(payload.get(key) != value for key, value in expected_header.items())
    ):
        raise ContractError("prediction artifact provenance hash mismatch")
    if set(payload) != set(expected_header) | {"entries", "predictions_hash"} or not isinstance(payload.get("entries"), list):
        raise ContractError("invalid prediction artifact payload")
    entries = payload["entries"]
    if payload.get("predictions_hash") != stable_hash(entries):
        raise ContractError("prediction entries hash mismatch")
    if len(entries) != len(dataset.row_hashes):
        raise ContractError("prediction entries do not match dataset rows")
    output: dict[str, float] = {}
    for expected_row_hash, entry in zip(dataset.row_hashes, entries, strict=True):
        if not isinstance(entry, dict) or set(entry) != {"row_hash", "prediction"}:
            raise ContractError("invalid prediction entry")
        row_hash, prediction = entry["row_hash"], entry["prediction"]
        if row_hash != expected_row_hash or row_hash in output:
            raise ContractError("duplicate or reordered prediction entry")
        if isinstance(prediction, bool) or not isinstance(prediction, (int, float)) or not math.isfinite(float(prediction)):
            raise ContractError("invalid prediction scalar")
        output[row_hash] = float(prediction)
    return output
