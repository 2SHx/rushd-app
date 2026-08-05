from __future__ import annotations

import json
import math
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch

from quant_ml.artifact import (
    ArtifactHashes,
    load_artifact,
    load_prediction_artifact,
    runtime_versions,
    save_artifact,
    save_prediction_artifact,
    sha256_file,
)
from quant_ml.config import (
    SEALED_EXPERIMENT_CONFIG_HASH,
    ModelConfig,
    TrainingConfig,
    plateau_trials,
)
from quant_ml.contracts import (
    FEATURE_NAMES,
    LABEL_SPEC,
    REAL_PIT,
    SYNTHETIC_TEST_ONLY,
    ContractError,
    RowMetadata,
    _validate_metadata,
    canonical_json,
    seal_dataset,
    stable_hash,
    validate_dataset,
)
from quant_ml.model import EXPECTED_PARAMETER_COUNT, HalalCausalTcnAlpha, parameter_count
from quant_ml.splits import (
    FROZEN_FOLD_COUNT,
    FROZEN_MINIMUM_TRAINING_SESSIONS,
    FROZEN_VALIDATION_SESSIONS,
    PurgedFold,
    _purged_expanding_folds,
    build_frozen_walk_forward_folds,
    five_fold_assignment_hash,
    split_assignment_hash,
)
from quant_ml.synthetic import synthetic_dataset, synthetic_panel_dataset
from quant_ml.training import (
    PREPROCESSOR_CONTRACT,
    DecisionDateCrossSectionalPreprocessor,
    _retrain_for_fixed_epochs,
    predict,
    select_final_epoch_count,
    train_five_fold_and_retrain,
    train_model,
)


def reseal(
    dataset,
    *,
    features=None,
    beta=None,
    metadata=None,
    feature_names=None,
    label_spec=None,
    dataset_class=None,
    trusted_lineage_root=None,
    experiment_config_hash=None,
):
    return seal_dataset(
        dataset.features if features is None else features,
        dataset.beta if beta is None else beta,
        dataset.targets,
        dataset.metadata if metadata is None else metadata,
        dataset_class=dataset.dataset_class if dataset_class is None else dataset_class,
        feature_names=dataset.feature_names if feature_names is None else feature_names,
        label_spec=dataset.label_spec if label_spec is None else label_spec,
        trusted_lineage_root=(
            dataset.trusted_lineage_root
            if trusted_lineage_root is None
            else trusted_lineage_root
        ),
        experiment_config_hash=(
            dataset.experiment_config_hash
            if experiment_config_hash is None
            else experiment_config_hash
        ),
    )


def as_real_pit(dataset, lineage_root="a" * 64):
    metadata = tuple(
        replace(
            row,
            source="REAL",
            membership="IN",
            membership_source="PIT_SNAPSHOT",
            membership_available_session=row.decision_session - 10,
            lifecycle="ACTIVE",
            lifecycle_available_session=row.decision_session - 10,
            sharia="VERIFIED_COMPLIANT",
            sharia_available_session=row.decision_session - 10,
            corporate_actions_known=True,
        )
        for row in dataset.metadata
    )
    return reseal(
        dataset,
        metadata=metadata,
        dataset_class=REAL_PIT,
        trusted_lineage_root=lineage_root,
    )


class ContractTests(unittest.TestCase):
    def test_canonical_json_and_hash(self) -> None:
        self.assertEqual(canonical_json({"b": 2, "a": 1}), '{"a":1,"b":2}')
        self.assertEqual(stable_hash({"b": 2, "a": 1}), stable_hash({"a": 1, "b": 2}))
        with self.assertRaises(ContractError):
            canonical_json({"bad": float("nan")})

    def test_synthetic_requires_explicit_permission_and_is_non_claiming(self) -> None:
        dataset = synthetic_dataset(4)
        self.assertEqual(dataset.dataset_class, SYNTHETIC_TEST_ONLY)
        with self.assertRaisesRegex(ContractError, "allow_synthetic"):
            validate_dataset(dataset)
        validate_dataset(dataset, allow_synthetic=True)
        with self.assertRaises(ContractError):
            validate_dataset(
                replace(dataset, dataset_class=REAL_PIT, trusted_lineage_root="a" * 64)
            )

    def test_real_lineage_requires_separate_exact_external_authority(self) -> None:
        dataset = as_real_pit(synthetic_dataset(4))
        with self.assertRaisesRegex(ContractError, "separate externally expected"):
            validate_dataset(dataset)
        with self.assertRaisesRegex(ContractError, "external authority"):
            validate_dataset(dataset, expected_lineage_root="b" * 64)
        validate_dataset(dataset, expected_lineage_root="a" * 64)
        forged = as_real_pit(synthetic_dataset(4), "b" * 64)
        with self.assertRaisesRegex(ContractError, "external authority"):
            validate_dataset(forged, expected_lineage_root="a" * 64)

    def test_dataset_rejects_sealed_experiment_drift(self) -> None:
        dataset = synthetic_dataset(4)
        drifted = reseal(dataset, experiment_config_hash="b" * 64)
        with self.assertRaisesRegex(ContractError, "sealed manifest"):
            validate_dataset(drifted, allow_synthetic=True)

    def test_default_lineage_cannot_validate(self) -> None:
        dataset = synthetic_dataset(1)
        row = dataset.metadata[0]
        default = RowMetadata(
            row.decision_session,
            row.feature_sessions,
            row.availability_sessions,
            row.label_start_session,
            row.label_end_session,
        )
        fail_closed = seal_dataset(
            dataset.features,
            dataset.beta,
            dataset.targets,
            (default,),
            dataset_class=SYNTHETIC_TEST_ONLY,
            feature_names=FEATURE_NAMES,
            label_spec=LABEL_SPEC,
            trusted_lineage_root=None,
        )
        with self.assertRaisesRegex(ContractError, "non-claiming"):
            validate_dataset(fail_closed, allow_synthetic=True)

    def test_real_lineage_rejects_current_sleeve_and_unknown_sharia(self) -> None:
        synthetic = synthetic_dataset(1).metadata[0]
        positive = replace(
            synthetic,
            source="REAL",
            membership="IN",
            membership_source="PIT_SNAPSHOT",
            membership_available_session=synthetic.decision_session - 10,
            lifecycle="ACTIVE",
            lifecycle_available_session=synthetic.decision_session - 10,
            sharia="VERIFIED_COMPLIANT",
            sharia_available_session=synthetic.decision_session - 10,
            corporate_actions_known=True,
        )
        _validate_metadata(positive, ModelConfig(), REAL_PIT)
        with self.assertRaisesRegex(ContractError, "current sleeve"):
            _validate_metadata(
                replace(positive, membership_source="CURRENT_SLEEVE"),
                ModelConfig(),
                REAL_PIT,
            )
        with self.assertRaisesRegex(ContractError, "Sharia"):
            _validate_metadata(replace(positive, sharia="UNKNOWN"), ModelConfig(), REAL_PIT)

    def test_feature_and_label_semantics_are_exact(self) -> None:
        dataset = synthetic_dataset(4)
        with self.assertRaisesRegex(ContractError, "feature names/order"):
            validate_dataset(
                replace(dataset, feature_names=tuple(reversed(FEATURE_NAMES))),
                allow_synthetic=True,
            )
        unknown_label = {**LABEL_SPEC, "version": "unknown"}
        with self.assertRaisesRegex(ContractError, "label specification"):
            validate_dataset(replace(dataset, label_spec=unknown_label), allow_synthetic=True)
        self.assertNotEqual(
            dataset.row_hashes,
            reseal(dataset, feature_names=tuple(reversed(FEATURE_NAMES))).row_hashes,
        )

    def test_temporal_label_beta_and_hash_guards(self) -> None:
        dataset = synthetic_dataset(8)
        row = dataset.metadata[0]
        bad_sessions = row.feature_sessions[:20] + (row.feature_sessions[19],) + row.feature_sessions[21:]
        with self.assertRaisesRegex(ContractError, "strictly ascending"):
            validate_dataset(
                reseal(dataset, metadata=(replace(row, feature_sessions=bad_sessions),) + dataset.metadata[1:]),
                allow_synthetic=True,
            )
        future = replace(row, feature_sessions=row.feature_sessions[:-1] + (row.decision_session + 1,))
        with self.assertRaisesRegex(ContractError, "future feature bar"):
            validate_dataset(reseal(dataset, metadata=(future,) + dataset.metadata[1:]), allow_synthetic=True)
        wrong_label = replace(row, label_end_session=row.decision_session + 4)
        with self.assertRaisesRegex(ContractError, r"decision\+1"):
            validate_dataset(reseal(dataset, metadata=(wrong_label,) + dataset.metadata[1:]), allow_synthetic=True)
        beta = dataset.beta.copy()
        beta[0] = 2.01
        with self.assertRaisesRegex(ContractError, "inclusive range"):
            validate_dataset(reseal(dataset, beta=beta), allow_synthetic=True)
        altered = dataset.features.copy()
        altered[0, 0, 0] += 1
        with self.assertRaisesRegex(ContractError, "data/hash"):
            validate_dataset(replace(dataset, features=altered), allow_synthetic=True)

    def test_future_availability_mock_and_nonfinite_fail(self) -> None:
        dataset = synthetic_dataset(4)
        row = dataset.metadata[0]
        availability = list(row.availability_sessions)
        availability[-1] = availability[-1][:-1] + (row.decision_session + 1,)
        with self.assertRaisesRegex(ContractError, "unavailable"):
            validate_dataset(
                reseal(dataset, metadata=(replace(row, availability_sessions=tuple(availability)),) + dataset.metadata[1:]),
                allow_synthetic=True,
            )
        with self.assertRaisesRegex(ContractError, "non-claiming"):
            validate_dataset(
                reseal(dataset, metadata=(replace(row, source="MOCK"),) + dataset.metadata[1:]),
                allow_synthetic=True,
            )
        bad = dataset.features.copy()
        bad[0, 0, 0] = np.nan
        with self.assertRaisesRegex(ContractError, "nonfinite"):
            validate_dataset(replace(dataset, features=bad), allow_synthetic=True)


class ArchitectureSplitPreprocessorTests(unittest.TestCase):
    def test_frozen_architecture_and_trials(self) -> None:
        model = HalalCausalTcnAlpha()
        self.assertEqual([block.dilation for block in model.blocks], [1, 2, 4, 8, 16, 32])
        self.assertEqual(parameter_count(model), EXPECTED_PARAMETER_COUNT)
        self.assertEqual(EXPECTED_PARAMETER_COUNT, 4_745)
        trials = plateau_trials()
        self.assertEqual(len(trials), 9)
        self.assertEqual(
            {(trial.learning_rate, trial.dropout) for trial in trials},
            {(lr, drop) for lr in (2e-4, 3e-4, 4e-4) for drop in (0.05, 0.10, 0.15)},
        )
        for trial in trials:
            trial.validate()
            ModelConfig(dropout=trial.dropout).validate()

    def test_generic_panel_split_keeps_dates_together_and_purges(self) -> None:
        dataset = synthetic_panel_dataset(40, 3)
        folds = _purged_expanding_folds(
            dataset.metadata,
            minimum_train_sessions=24,
            validation_sessions=8,
            fold_count=2,
        )
        for fold in folds:
            train_dates = {dataset.metadata[index].decision_session for index in fold.train_indices}
            test_dates = {
                dataset.metadata[index].decision_session
                for index in fold.validation_indices
            }
            self.assertFalse(train_dates & test_dates)
            self.assertEqual(len(test_dates), 8)
            self.assertEqual(len(fold.validation_indices), 24)
            first_test = min(test_dates)
            self.assertTrue(all(dataset.metadata[index].label_end_session < first_test - 5 for index in fold.train_indices))

    def test_frozen_walk_forward_exact_metadata_only(self) -> None:
        date_count = 504 + 5 + 5 + 5 * 126
        metadata = tuple(
            RowMetadata(
                decision_session=decision,
                feature_sessions=(),
                availability_sessions=(),
                label_start_session=decision + 1,
                label_end_session=decision + 5,
            )
            for decision in range(date_count)
            for _ in range(2)
        )
        folds = build_frozen_walk_forward_folds(metadata)
        self.assertEqual(len(folds), FROZEN_FOLD_COUNT)
        starts = []
        for fold in folds:
            train_dates = {metadata[index].decision_session for index in fold.train_indices}
            validation_dates = {
                metadata[index].decision_session for index in fold.validation_indices
            }
            self.assertGreaterEqual(len(train_dates), FROZEN_MINIMUM_TRAINING_SESSIONS)
            self.assertEqual(len(validation_dates), FROZEN_VALIDATION_SESSIONS)
            self.assertEqual(
                len(fold.validation_indices), 2 * FROZEN_VALIDATION_SESSIONS
            )
            self.assertFalse(train_dates & validation_dates)
            starts.append(min(validation_dates))
        self.assertEqual(
            [right - left for left, right in zip(starts, starts[1:])],
            [126, 126, 126, 126],
        )

    def test_cross_sectional_preprocessor_clips_and_isolates_dates(self) -> None:
        dataset = synthetic_panel_dataset(2, 101)
        features = np.zeros_like(dataset.features)
        features[100] = 1_000_000
        features[101:] = np.linspace(-1, 1, 101, dtype=np.float32)[:, None, None]
        preprocessor = DecisionDateCrossSectionalPreprocessor()
        first = preprocessor.transform(features, dataset.metadata)
        self.assertLess(float(np.max(np.abs(first[:101]))), 1e-6)
        changed = features.copy()
        changed[100] = -1_000_000
        second = preprocessor.transform(changed, dataset.metadata)
        np.testing.assert_array_equal(first[101:], second[101:])
        self.assertEqual(preprocessor.contract_hash, stable_hash(PREPROCESSOR_CONTRACT))

    def test_final_epoch_is_median_of_five(self) -> None:
        self.assertEqual(select_final_epoch_count((9, 2, 7, 5, 11)), 7)
        with self.assertRaisesRegex(ContractError, "five"):
            select_final_epoch_count((3,))


class TrainingArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dataset = synthetic_dataset(32)
        cls.training_rows = tuple(range(10))
        cls.validation_rows = tuple(range(20, 32))
        cls.result = train_model(
            cls.dataset,
            cls.training_rows,
            cls.validation_rows,
            allow_synthetic=True,
        )
        cls.split_hash = cls.result.split_hash

    def test_default_training_rejects_synthetic_and_same_date_overlap(self) -> None:
        with self.assertRaisesRegex(ContractError, "allow_synthetic"):
            train_model(self.dataset, self.training_rows, self.validation_rows)
        panel = synthetic_panel_dataset(12, 2)
        train = tuple(range(0, 12, 2))
        validation = tuple(range(1, 24, 2))
        with self.assertRaisesRegex(ContractError, "decision sessions"):
            train_model(panel, train, validation, allow_synthetic=True)
        with self.assertRaisesRegex(ContractError, "purge plus five-session embargo"):
            train_model(
                self.dataset,
                tuple(range(20)),
                self.validation_rows,
                allow_synthetic=True,
            )

    def test_real_training_and_prediction_require_external_lineage(self) -> None:
        dataset = as_real_pit(self.dataset)
        with self.assertRaisesRegex(ContractError, "separate externally expected"):
            train_model(dataset, self.training_rows, self.validation_rows)
        with self.assertRaisesRegex(ContractError, "external authority"):
            train_model(
                dataset,
                self.training_rows,
                self.validation_rows,
                expected_lineage_root="b" * 64,
            )
        with self.assertRaisesRegex(ContractError, "separate externally expected"):
            predict(self.result.model, self.result.preprocessor, dataset)
        with self.assertRaisesRegex(ContractError, "materializer capability unavailable"):
            predict(
                self.result.model,
                self.result.preprocessor,
                dataset,
                expected_lineage_root="a" * 64,
            )
        with self.assertRaisesRegex(ContractError, "materializer capability unavailable"):
            train_model(
                dataset,
                self.training_rows,
                self.validation_rows,
                expected_lineage_root="a" * 64,
            )
        with self.assertRaisesRegex(ContractError, "materializer capability unavailable"):
            _retrain_for_fixed_epochs(
                dataset,
                self.training_rows,
                TrainingConfig(),
                1,
            )

    def test_training_rejects_unsealed_python_patch(self) -> None:
        with patch("quant_ml.training.platform.python_version", return_value="3.12.5"):
            with self.assertRaisesRegex(ContractError, "sealed runtime"):
                train_model(
                    self.dataset,
                    self.training_rows,
                    self.validation_rows,
                    allow_synthetic=True,
                )

    def test_runtime_seals_interop_threads_before_training(self) -> None:
        self.assertEqual(torch.get_num_interop_threads(), 1)
        self.assertEqual(runtime_versions()["torch_interop_threads"], "1")
        with patch("quant_ml.training.torch.get_num_interop_threads", return_value=8):
            with self.assertRaisesRegex(ContractError, "sealed runtime"):
                train_model(
                    self.dataset,
                    self.training_rows,
                    self.validation_rows,
                    allow_synthetic=True,
                )

    def test_synthetic_smoke_is_finite_repeatable_and_non_promotable(self) -> None:
        replay = train_model(
            self.dataset,
            self.training_rows,
            self.validation_rows,
            allow_synthetic=True,
        )
        self.assertFalse(self.result.promotable)
        self.assertTrue(all(math.isfinite(loss) for loss in self.result.losses + self.result.validation_losses))
        self.assertEqual(self.result.losses, replay.losses)
        self.assertEqual(
            predict(self.result.model, self.result.preprocessor, self.dataset, allow_synthetic=True),
            predict(replay.model, replay.preprocessor, self.dataset, allow_synthetic=True),
        )

    def test_undersized_five_fold_schedule_is_rejected(self) -> None:
        dataset = synthetic_dataset(70)
        folds = tuple(
            PurgedFold(
                train_indices=tuple(range(10 + fold_index * 10)),
                validation_indices=tuple(
                    range(20 + fold_index * 10, 24 + fold_index * 10)
                ),
            )
            for fold_index in range(5)
        )
        with self.assertRaisesRegex(ContractError, "frozen walk-forward"):
            train_five_fold_and_retrain(dataset, folds, allow_synthetic=True)

        one_fold = train_model(
            dataset,
            folds[0].train_indices,
            folds[0].validation_indices,
            allow_synthetic=True,
        )
        final_train_indices = tuple(
            sorted(
                {
                    index
                    for fold in folds
                    for index in (*fold.train_indices, *fold.validation_indices)
                }
            )
        )
        forged = replace(
            one_fold,
            split_hash=five_fold_assignment_hash(
                dataset, folds, final_train_indices
            ),
            fold_split_hashes=tuple(
                split_assignment_hash(
                    dataset, fold.train_indices, fold.validation_indices
                )
                for fold in folds
            ),
            verified_folds=folds,
            final_train_indices=final_train_indices,
            epoch_selection="MEDIAN_OF_EXACTLY_FIVE_INNER_FOLDS_FINAL_RETRAIN",
            inner_fold_best_epoch_counts=(1, 1, 1, 1, 1),
            final_epoch_count=1,
            epochs_trained=1,
            promotable=False,
        )
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ContractError, "frozen walk-forward"):
                save_artifact(
                    Path(temporary),
                    forged,
                    dataset,
                    expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
                )

    def _saved_model(self, directory: Path):
        hashes = save_artifact(
            directory,
            self.result,
            self.dataset,
            expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
        )
        artifact = load_artifact(
            directory,
            expected_hashes=hashes,
            expected_data_hash=self.dataset.dataset_hash,
            expected_split_hash=self.split_hash,
            expected_preprocessor_hash=self.result.preprocessor.contract_hash,
            expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
        )
        return hashes, artifact

    def test_artifact_trusted_roots_round_trip_and_replay(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "first"
            hashes, artifact = self._saved_model(directory)
            self.assertFalse(artifact.metadata["promotable"])
            self.assertEqual(artifact.metadata["runtime"], runtime_versions())
            for key in (
                "schema_hash", "code_hash", "model_hash", "experiment_config_hash", "data_hash",
                "state_sha256", "split_hash", "preprocessor_hash", "runtime_hash",
                "feature_names_hash", "label_spec_hash", "model_training_config_hash",
            ):
                self.assertEqual(len(artifact.metadata[key]), 64)
            replay_hashes, replay = self._saved_model(Path(temporary) / "second")
            self.assertEqual(hashes, replay_hashes)
            self.assertEqual(
                predict(artifact.model, artifact.preprocessor, self.dataset, allow_synthetic=True),
                predict(replay.model, replay.preprocessor, self.dataset, allow_synthetic=True),
            )
            with self.assertRaises(TypeError):
                load_artifact(directory)  # type: ignore[call-arg]
            metadata_path = directory / "metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["output_contract"] = "altered"
            metadata_path.write_text(canonical_json(metadata) + "\n", encoding="utf-8")
            manifest_path = directory / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["files"]["metadata.json"] = sha256_file(metadata_path)
            manifest_path.write_text(canonical_json(manifest) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "trusted hashes"):
                load_artifact(
                    directory,
                    expected_hashes=hashes,
                    expected_data_hash=self.dataset.dataset_hash,
                    expected_split_hash=self.split_hash,
                    expected_preprocessor_hash=self.result.preprocessor.contract_hash,
                    expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
                )

    def test_artifact_rejects_caller_forged_split_and_experiment_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ContractError, "sealed experiment"):
                save_artifact(
                    Path(temporary),
                    self.result,
                    self.dataset,
                    expected_experiment_config_hash="b" * 64,
                )
            forged = replace(self.result, split_hash="b" * 64)
            with self.assertRaisesRegex(ContractError, "non-promotable"):
                save_artifact(
                    Path(temporary),
                    forged,
                    self.dataset,
                    expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
                )

    def test_coordinated_real_relabel_cannot_create_promotable_artifact(self) -> None:
        dataset = as_real_pit(self.dataset)
        split_hash = split_assignment_hash(
            dataset, self.training_rows, self.validation_rows
        )
        forged = replace(
            self.result,
            dataset_hash=dataset.dataset_hash,
            dataset_class=REAL_PIT,
            trusted_lineage_root="a" * 64,
            split_hash=split_hash,
            fold_split_hashes=(split_hash,),
            verified_folds=(PurgedFold(self.training_rows, self.validation_rows),),
            promotable=True,
        )
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ContractError, "materializer capability unavailable"):
                save_artifact(
                    Path(temporary),
                    forged,
                    dataset,
                    expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
                    expected_lineage_root="a" * 64,
                )

    def test_prediction_artifact_requires_trusted_roots_and_rejects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            _, artifact = self._saved_model(directory / "model")
            predictions = predict(artifact.model, artifact.preprocessor, self.dataset, allow_synthetic=True)
            path = directory / "predictions.json"
            file_hash = save_prediction_artifact(
                path,
                predictions,
                self.dataset,
                artifact,
                expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
                allow_synthetic=True,
            )
            loaded = load_prediction_artifact(
                path,
                self.dataset,
                artifact,
                expected_sha256=file_hash,
                expected_data_hash=self.dataset.dataset_hash,
                expected_split_hash=self.split_hash,
                expected_preprocessor_hash=self.result.preprocessor.contract_hash,
                expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
                allow_synthetic=True,
            )
            self.assertEqual(loaded, predictions)
            envelope = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(envelope["payload"]["predictions_hash"], stable_hash(envelope["payload"]["entries"]))
            original_envelope = json.loads(path.read_text(encoding="utf-8"))
            envelope["payload"]["entries"][0]["prediction"] += 1
            path.write_text(canonical_json(envelope) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "trusted hash"):
                load_prediction_artifact(
                    path,
                    self.dataset,
                    artifact,
                    expected_sha256=file_hash,
                    expected_data_hash=self.dataset.dataset_hash,
                    expected_split_hash=self.split_hash,
                    expected_preprocessor_hash=self.result.preprocessor.contract_hash,
                    expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
                    allow_synthetic=True,
                )

            def semantic_tamper(mutator) -> None:
                changed = json.loads(canonical_json(original_envelope))
                mutator(changed["payload"]["entries"])
                changed["payload"]["predictions_hash"] = stable_hash(changed["payload"]["entries"])
                changed["payload_hash"] = stable_hash(changed["payload"])
                path.write_text(canonical_json(changed) + "\n", encoding="utf-8")
                with self.assertRaisesRegex(ContractError, "duplicate or reordered"):
                    load_prediction_artifact(
                        path,
                        self.dataset,
                        artifact,
                        expected_sha256=sha256_file(path),
                        expected_data_hash=self.dataset.dataset_hash,
                        expected_split_hash=self.split_hash,
                        expected_preprocessor_hash=self.result.preprocessor.contract_hash,
                        expected_experiment_config_hash=SEALED_EXPERIMENT_CONFIG_HASH,
                        allow_synthetic=True,
                    )

            semantic_tamper(
                lambda entries: entries[1].update({"row_hash": entries[0]["row_hash"]})
            )
            semantic_tamper(
                lambda entries: entries.__setitem__(slice(0, 2), [entries[1], entries[0]])
            )


if __name__ == "__main__":
    unittest.main()
