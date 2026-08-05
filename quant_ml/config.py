from __future__ import annotations

from dataclasses import asdict, dataclass

MODEL_ID = "halal-causal-tcn-alpha"
MODEL_VERSION = "v1"
SEALED_EXPERIMENT_CONFIG_HASH = (
    "97014858099cb6c01a36692af231ff147e495e1d75ab22a4265ff3e4bd648b17"
)
SEALED_PYTHON_VERSION = "3.12.4"
SEALED_NUMPY_VERSION = "2.5.1"
SEALED_TORCH_VERSION = "2.13.0"


@dataclass(frozen=True)
class ModelConfig:
    sessions: int = 126
    channels: int = 10
    hidden_channels: int = 16
    dilations: tuple[int, ...] = (1, 2, 4, 8, 16, 32)
    kernel_size: int = 3
    head_hidden: int = 8
    dropout: float = 0.10

    def validate(self) -> None:
        frozen = (126, 10, 16, (1, 2, 4, 8, 16, 32), 3, 8)
        actual = (
            self.sessions,
            self.channels,
            self.hidden_channels,
            self.dilations,
            self.kernel_size,
            self.head_hidden,
        )
        if actual != frozen or self.dropout not in (0.05, 0.10, 0.15):
            raise ValueError("architecture differs from frozen halal-causal-tcn-alpha@v1")

    def to_dict(self) -> dict[str, object]:
        self.validate()
        return asdict(self)


@dataclass(frozen=True)
class TrainingConfig:
    seed: int = 42
    learning_rate: float = 3e-4
    weight_decay: float = 1e-4
    batch_size: int = 512
    gradient_clip: float = 1.0
    max_epochs: int = 64
    patience: int = 8
    min_delta: float = 1e-5
    huber_delta: float = 0.02
    dropout: float = 0.10

    def validate(self) -> None:
        frozen = (
            self.seed,
            self.weight_decay,
            self.batch_size,
            self.gradient_clip,
            self.max_epochs,
            self.patience,
            self.min_delta,
            self.huber_delta,
        )
        if frozen != (42, 1e-4, 512, 1.0, 64, 8, 1e-5, 0.02):
            raise ValueError("training controls differ from frozen halal-causal-tcn-alpha@v1")
        if self.learning_rate not in (2e-4, 3e-4, 4e-4):
            raise ValueError("learning rate is outside the frozen plateau")
        if self.dropout not in (0.05, 0.10, 0.15):
            raise ValueError("dropout is outside the frozen plateau")

    def to_dict(self) -> dict[str, object]:
        self.validate()
        return asdict(self)


def plateau_trials() -> tuple[TrainingConfig, ...]:
    """The nine pre-registered robustness variants; order is stable."""
    return tuple(
        TrainingConfig(learning_rate=learning_rate, dropout=dropout)
        for learning_rate in (2e-4, 3e-4, 4e-4)
        for dropout in (0.05, 0.10, 0.15)
    )
