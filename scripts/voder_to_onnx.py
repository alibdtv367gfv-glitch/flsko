#!/usr/bin/env python3
"""
Convert VITS / VODER-like PyTorch TTS checkpoints to ONNX, then quantize to INT8
for on-device Android use (limited RAM).

This script does NOT download illegal weights or bypass licenses.
You must supply a path to a model you are allowed to use (e.g. open VITS /
Piper-compatible or your own trained checkpoint).

Dependencies (install in a venv):
  pip install torch onnx onnxruntime onnxscript

Optional dynamic quant (onnxruntime):
  pip install onnxruntime

Example:
  python scripts/voder_to_onnx.py \\
    --checkpoint path/to/vits.pt \\
    --config path/to/config.json \\
    --output-dir artifacts/onnx \\
    --opset 17 \\
    --quantize-int8
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export VITS-like TTS to ONNX + INT8")
    p.add_argument("--checkpoint", type=Path, required=True, help="PyTorch .pt/.pth checkpoint")
    p.add_argument("--config", type=Path, default=None, help="Optional JSON config (sample rate, etc.)")
    p.add_argument("--output-dir", type=Path, default=Path("artifacts/onnx"))
    p.add_argument("--opset", type=int, default=17)
    p.add_argument("--max-phoneme-len", type=int, default=256, help="Dummy sequence length for export")
    p.add_argument("--quantize-int8", action="store_true", help="Apply dynamic INT8 quantization")
    p.add_argument(
        "--export-stub",
        action="store_true",
        help="If true, export a tiny stub network when full VITS class is not available (CI/demo only)",
    )
    return p.parse_args()


def load_config(path: Path | None) -> dict:
    if path is None or not path.is_file():
        return {"sample_rate": 22050, "hop_length": 256}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def try_import_vits():
    """
    Attempt to import a user-provided VITS implementation.
    Projects often vendor `models.py` next to the checkpoint.
    """
    try:
        # Common pattern in open VITS repos
        from models import SynthesizerTrn  # type: ignore

        return SynthesizerTrn
    except Exception:
        return None


def build_stub_model(sample_rate: int = 22050):
    """Minimal torch module so the export pipeline can be tested without full VITS."""
    import torch
    import torch.nn as nn

    class StubTTS(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.emb = nn.Embedding(256, 64)
            self.lin = nn.Linear(64, 1)
            self.sample_rate = sample_rate

        def forward(self, x: "torch.Tensor", x_lengths: "torch.Tensor") -> "torch.Tensor":
            # x: [B, T] int64 phoneme ids
            h = self.emb(x.clamp(0, 255)).mean(dim=1)
            # Fake short waveform [B, samples]
            amp = torch.tanh(self.lin(h))
            t = torch.linspace(0, 1, steps=sample_rate // 10, device=x.device)
            wave = (amp * torch.sin(2 * 3.1415 * 220 * t)).unsqueeze(0).expand(x.size(0), -1)
            return wave

    return StubTTS()


def export_onnx(model, output_path: Path, opset: int, max_len: int) -> None:
    import torch

    model.eval()
    dummy_x = torch.randint(0, 50, (1, max_len), dtype=torch.long)
    dummy_len = torch.tensor([max_len], dtype=torch.long)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        (dummy_x, dummy_len),
        str(output_path),
        input_names=["phoneme_ids", "phoneme_lengths"],
        output_names=["audio"],
        dynamic_axes={
            "phoneme_ids": {0: "batch", 1: "time"},
            "phoneme_lengths": {0: "batch"},
            "audio": {0: "batch", 1: "samples"},
        },
        opset_version=opset,
        do_constant_folding=True,
    )
    print(f"[ok] ONNX written: {output_path}")


def quantize_dynamic_int8(onnx_path: Path, quant_path: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quant_path.parent.mkdir(parents=True, exist_ok=True)
    quantize_dynamic(
        model_input=str(onnx_path),
        model_output=str(quant_path),
        weight_type=QuantType.QInt8,
    )
    print(f"[ok] INT8 quantized: {quant_path}")


def main() -> int:
    args = parse_args()
    if not args.checkpoint.is_file() and not args.export_stub:
        print(f"[error] checkpoint not found: {args.checkpoint}", file=sys.stderr)
        print("Pass --export-stub to test the pipeline without a real checkpoint.", file=sys.stderr)
        return 1

    try:
        import torch
    except ImportError:
        print("[error] install torch first: pip install torch", file=sys.stderr)
        return 1

    cfg = load_config(args.config)
    sample_rate = int(cfg.get("sample_rate", 22050))

    SynthesizerTrn = try_import_vits()
    if SynthesizerTrn is not None and args.checkpoint.is_file():
        print("[info] Using vendored VITS SynthesizerTrn")
        # Exact constructor args depend on the upstream config; load state_dict flexibly.
        model = SynthesizerTrn(
            n_vocab=256,
            spec_channels=513,
            segment_size=8192,
            inter_channels=192,
            hidden_channels=192,
            filter_channels=768,
            n_heads=2,
            n_layers=6,
            kernel_size=3,
            p_dropout=0.1,
            resblock="1",
            resblock_kernel_sizes=[3, 7, 11],
            resblock_dilation_sizes=[[1, 3, 5], [1, 3, 5], [1, 3, 5]],
            upsample_rates=[8, 8, 2, 2],
            upsample_initial_channel=512,
            upsample_kernel_sizes=[16, 16, 4, 4],
        )
        state = torch.load(str(args.checkpoint), map_location="cpu")
        if isinstance(state, dict) and "model" in state:
            state = state["model"]
        missing, unexpected = model.load_state_dict(state, strict=False)
        print(f"[info] load_state_dict missing={len(missing)} unexpected={len(unexpected)}")
    elif args.export_stub:
        print("[warn] Exporting STUB model only — replace with real VITS weights for production")
        model = build_stub_model(sample_rate)
    else:
        print(
            "[error] Could not import models.SynthesizerTrn and --export-stub not set.\n"
            "Vendor your VITS models.py on PYTHONPATH or use --export-stub for a pipeline test.",
            file=sys.stderr,
        )
        return 1

    out_dir = args.output_dir
    onnx_path = out_dir / "voder_tts.onnx"
    export_onnx(model, onnx_path, args.opset, args.max_phoneme_len)

    meta = {
        "format": "onnx",
        "sample_rate": sample_rate,
        "inputs": ["phoneme_ids", "phoneme_lengths"],
        "outputs": ["audio"],
        "quantization": None,
        "notes": "Phonemizer must match training; pair with espeak-ng or the same G2P used at train time.",
    }
    if args.quantize_int8:
        quant_path = out_dir / "voder_tts_int8.onnx"
        try:
            quantize_dynamic_int8(onnx_path, quant_path)
            meta["quantization"] = "dynamic_int8"
            meta["quantized_file"] = quant_path.name
        except Exception as exc:
            print(f"[warn] INT8 quant failed: {exc}", file=sys.stderr)

    meta_path = out_dir / "voder_tts.meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ok] meta: {meta_path}")
    print(
        "\nNext: host the .onnx on HTTPS, then use Android VoderModelDownloader +\n"
        "VoderOfflineManager (modules/voder-offline) inside an Expo development build."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
