"""CLI entrypoint: one image + a checkpoint -> a single prediction, in the
contract documented in ml/README.md. This is NOT integrated with the Expo app
- it exists to prove reproducible inference from a saved checkpoint alone
(no training code/config needed at inference time beyond what the checkpoint
embeds), matching what a future real inference API would need to do.

Usage (from the ml/ directory):
    python -m src.inference.predict --image path/to/photo.jpg --checkpoint outputs/<run>/best_model.pt
"""

from __future__ import annotations

import argparse
import json

from src.inference.postprocess import format_top_k
from src.utils.classes import class_map_from_dict
from src.utils.device import get_device


def predict(image_path: str, checkpoint_path: str, device_pref: str = "auto", top_k: int = 3) -> dict:
    import torch
    from PIL import Image

    from src.datasets.transforms import build_eval_transform
    from src.training.model import build_model

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    class_map = class_map_from_dict(checkpoint["class_map"])
    device = get_device(device_pref)

    model = build_model(checkpoint["backbone"], num_classes=len(class_map), pretrained=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()

    transform = build_eval_transform(checkpoint["image_size"])
    image = Image.open(image_path).convert("RGB")
    tensor = transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)[0].cpu().tolist()

    result = format_top_k(probabilities, class_map, k=top_k)
    result["model_version"] = checkpoint.get("model_version", "ingredient-classifier-v0")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a single-image prediction with a saved v0 checkpoint.")
    parser.add_argument("--image", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--top-k", type=int, default=3)
    args = parser.parse_args()

    result = predict(args.image, args.checkpoint, args.device, args.top_k)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
