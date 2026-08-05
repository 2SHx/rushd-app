from __future__ import annotations

import torch
from torch import nn
from torch.nn import functional as functional

from .config import ModelConfig


class CausalDepthwiseSeparable(nn.Module):
    def __init__(self, channels: int, kernel_size: int, dilation: int, dropout: float) -> None:
        super().__init__()
        self.left_padding = dilation * (kernel_size - 1)
        self.depthwise = nn.Conv1d(
            channels,
            channels,
            kernel_size,
            dilation=dilation,
            groups=channels,
        )
        self.pointwise = nn.Conv1d(channels, channels, 1)
        self.norm = nn.LayerNorm(channels)
        self.activation = nn.GELU()
        self.dropout = nn.Dropout(dropout)

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        values = self.depthwise(functional.pad(values, (self.left_padding, 0)))
        values = self.pointwise(values).transpose(1, 2)
        values = self.dropout(self.activation(self.norm(values)))
        return values.transpose(1, 2)


class ResidualCausalBlock(nn.Module):
    """Canonical two-convolution TCN residual block at one frozen dilation."""

    def __init__(self, channels: int, kernel_size: int, dilation: int, dropout: float) -> None:
        super().__init__()
        self.dilation = dilation
        self.first = CausalDepthwiseSeparable(channels, kernel_size, dilation, dropout)
        self.second = CausalDepthwiseSeparable(channels, kernel_size, dilation, dropout)

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        return values + self.second(self.first(values))


class HalalCausalTcnAlpha(nn.Module):
    def __init__(self, config: ModelConfig | None = None) -> None:
        super().__init__()
        self.config = config or ModelConfig()
        self.config.validate()
        self.projection = nn.Conv1d(self.config.channels, self.config.hidden_channels, 1)
        self.blocks = nn.ModuleList(
            ResidualCausalBlock(
                self.config.hidden_channels,
                self.config.kernel_size,
                dilation,
                self.config.dropout,
            )
            for dilation in self.config.dilations
        )
        self.head = nn.Sequential(
            nn.Linear(self.config.hidden_channels + 1, self.config.head_hidden),
            nn.GELU(),
            nn.Linear(self.config.head_hidden, 1),
        )

    def forward(self, features: torch.Tensor, beta: torch.Tensor) -> torch.Tensor:
        values = self.projection(features.transpose(1, 2))
        for block in self.blocks:
            values = block(values)
        last_state = values[:, :, -1]
        return self.head(torch.cat((last_state, beta.reshape(-1, 1)), dim=1)).squeeze(1)


def parameter_count(model: nn.Module) -> int:
    return sum(parameter.numel() for parameter in model.parameters())


EXPECTED_PARAMETER_COUNT = 4_745
_frozen_parameter_count = parameter_count(HalalCausalTcnAlpha())
assert _frozen_parameter_count == EXPECTED_PARAMETER_COUNT
assert 3_500 <= _frozen_parameter_count <= 5_000  # deliberately near 4K, not a large model
