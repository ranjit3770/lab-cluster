import ctypes
import sys


def _enable_md4():
    try:
        libcrypto = ctypes.CDLL("libcrypto.so.3")
        libcrypto.OSSL_PROVIDER_load.restype = ctypes.c_void_p
        libcrypto.OSSL_PROVIDER_load.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        for name in (b"legacy", b"default"):
            if not libcrypto.OSSL_PROVIDER_load(None, name):
                print(f"[openssl] Warning: could not activate '{name.decode()}' provider", file=sys.stderr)
    except OSError:
        pass


_enable_md4()

import winrm

from .config import Config
from .models import CommandResult


class WinRMClient:

    def __init__(
        self,
        config: Config,
        host: str,
    ):

        self.config = config
        self.host = host

        endpoint = (
            f"http://{host}:"
            f"{config.port}/wsman"
        )

        self.session = winrm.Session(
            target=endpoint,
            auth=(
                config.username,
                config.password,
            ),
            transport=config.transport,
        )

    def run_cmd(
        self,
        command: str,
        args: list[str] | None = None,
    ) -> CommandResult:

        args = args or []

        result = self.session.run_cmd(
            command,
            args,
        )

        return CommandResult(
            command=" ".join(
                [command, *args]
            ),
            stdout=result.std_out.decode(
                "utf-8",
                errors="replace",
            ),
            stderr=result.std_err.decode(
                "utf-8",
                errors="replace",
            ),
            return_code=result.status_code,
        )

    def run_ps(
        self,
        script: str,
    ) -> CommandResult:

        result = self.session.run_ps(
            script
        )

        return CommandResult(
            command="PowerShell",
            stdout=result.std_out.decode(
                "utf-8",
                errors="replace",
            ),
            stderr=result.std_err.decode(
                "utf-8",
                errors="replace",
            ),
            return_code=result.status_code,
        )