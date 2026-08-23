from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class Host:
    name: str
    address: str


def load_inventory(
    path: str = "hosts.yaml",
) -> list[Host]:

    inventory_path = Path(path)

    if not inventory_path.exists():
        raise FileNotFoundError(
            f"Inventory file not found: {path}"
        )

    data = yaml.safe_load(
        inventory_path.read_text()
    )

    if not data or "hosts" not in data:
        raise ValueError(
            "Inventory must contain a 'hosts' list"
        )

    hosts = []

    for item in data["hosts"]:

        if "name" not in item:
            raise ValueError(
                "Each host requires 'name'"
            )

        if "address" not in item:
            raise ValueError(
                f"Host {item['name']} requires 'address'"
            )

        hosts.append(
            Host(
                name=str(item["name"]),
                address=str(item["address"]),
            )
        )

    return hosts