from dataclasses import dataclass
import os

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Config:
    username: str
    password: str
    port: int
    transport: str
    target_os: str = "ubuntu"


def load_config() -> Config:
    required = [
        "WIN_USERNAME",
        "WIN_PASSWORD",
    ]

    missing = [
        key
        for key in required
        if not os.getenv(key)
    ]

    if missing:
        raise RuntimeError(
            f"Missing environment variables: {', '.join(missing)}"
        )

    return Config(
        username=os.environ["WIN_USERNAME"],
        password=os.environ["WIN_PASSWORD"],
        port=int(
            os.getenv("WINRM_PORT", "5985")
        ),
        transport=os.getenv(
            "WINRM_TRANSPORT",
            "ntlm",
        ),
        target_os=os.getenv(
            "TARGET_OS",
            "ubuntu",
        ).lower(),
    )