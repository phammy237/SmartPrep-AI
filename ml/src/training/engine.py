"""The actual per-epoch train/eval loops - pure functions over a model, a
DataLoader, an optimizer/criterion, and a device, so train.py (the CLI) stays
a thin orchestration script and these loops are unit-testable on their own
with a tiny synthetic DataLoader.
"""

from __future__ import annotations


def train_one_epoch(model, loader, optimizer, criterion, device) -> dict:
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        batch_size = labels.size(0)
        running_loss += loss.item() * batch_size
        correct += (outputs.argmax(dim=1) == labels).sum().item()
        total += batch_size

    return {"loss": running_loss / total, "accuracy": correct / total}


def evaluate_loss_and_accuracy(model, loader, criterion, device) -> dict:
    """Validation-time evaluation: loss + accuracy only, no gradient. See
    src/evaluation/metrics.py for the fuller test-set report (precision/
    recall/F1/confusion matrix) - that one is deliberately separate so a
    per-epoch validation pass during training stays cheap."""
    import torch

    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)

            batch_size = labels.size(0)
            running_loss += loss.item() * batch_size
            correct += (outputs.argmax(dim=1) == labels).sum().item()
            total += batch_size

    return {"loss": running_loss / total, "accuracy": correct / total}


def build_optimizer(model, name: str, learning_rate: float, weight_decay: float):
    import torch.optim as optim

    if name == "adamw":
        return optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
    if name == "sgd":
        return optim.SGD(model.parameters(), lr=learning_rate, weight_decay=weight_decay, momentum=0.9)
    raise ValueError(f"Unsupported optimizer {name!r}")
