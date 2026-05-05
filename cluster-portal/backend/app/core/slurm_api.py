import requests
import subprocess
import os
import time
import logging
import re
from typing import Optional, Dict, Any, List
from app.core.config import settings

logger = logging.getLogger(__name__)

class SlurmReadOnlyClient:
    """
    Client for read-only operations using the Slurm REST API.
    Used for dashboard and status monitoring via Unix Socket.
    """
    def __init__(self):
        self.session = requests.Session()
        self.base_url = settings.SLURM_REST_URL
        self.jwt_user = settings.SLURM_JWT_USER
        self._static_jwt_token = settings.SLURM_JWT_TOKEN
        self._jwt_token = settings.SLURM_JWT_TOKEN
        self._jwt_expiry = 0
        self._jwt_retry_after = 0
        self.last_error = None
        self.request_timeout = float(os.getenv("SLURM_REST_TIMEOUT_SECONDS", "2"))
        self.jwt_failure_ttl = int(os.getenv("SLURM_JWT_FAILURE_TTL_SECONDS", "30"))

    def _get_jwt(self) -> str:
        """Fetch or generate a Slurm JWT."""
        if self._static_jwt_token:
            return self._static_jwt_token

        if self._jwt_token and time.time() < self._jwt_expiry:
            return self._jwt_token

        if time.time() < self._jwt_retry_after:
            return ""

        try:
            # Command from user request: generate token via scontrol
            # export PATH=/usr/local/slurm/bin:/usr/local/slurm/sbin:$PATH; export LD_LIBRARY_PATH=/usr/local/slurm/lib;
            env = os.environ.copy()
            env["PATH"] = f"{settings.SLURM_PATH}:{env.get('PATH', '')}"
            env["LD_LIBRARY_PATH"] = settings.SLURM_LIB_PATH
            
            scontrol_path = f"{settings.SLURM_PATH.split(':')[0]}/scontrol"
            cmd = [scontrol_path, "token", f"username={self.jwt_user}", "lifespan=3600"]
            
            # Use sudo if running as non-root (usually UID 0 in Docker but might vary on host)
            if os.getuid() != 0:
                cmd = ["sudo"] + cmd
            
            logger.info(f"Generating Slurm JWT token via: {' '.join(cmd)}")
            output = subprocess.check_output(
                cmd,
                env=env,
                stderr=subprocess.STDOUT,
                timeout=self.request_timeout,
            ).decode()
            
            for line in output.split('\n'):
                if "SLURM_JWT=" in line or line.strip().startswith("eyJ"): # Support raw token output or SLURM_JWT= format
                    self._jwt_token = line.split('=')[-1].strip()
                    self._jwt_expiry = time.time() + 3500
                    self.last_error = None
                    return self._jwt_token
        except Exception as e:
            self._jwt_retry_after = time.time() + self.jwt_failure_ttl
            self.last_error = str(e)
            logger.error(f"Slurm JWT Generation Error: {e}")
            if hasattr(e, 'output'):
                logger.error(f"Command Output: {e.output.decode()}")
        
        return ""

    def _get_headers(self) -> Optional[Dict[str, str]]:
        token = self._get_jwt()
        if not token:
            return None

        return {
            "Content-Type": "application/json",
            "X-SLURM-USER-NAME": self.jwt_user,
            "X-SLURM-USER-TOKEN": token
        }

    def _get(self, endpoint: str) -> Optional[Dict[str, Any]]:
        url = f"{self.base_url}/{endpoint}"
        try:
            headers = self._get_headers()
            if headers is None:
                logger.error(f"Slurm REST API GET skipped ({endpoint}): JWT unavailable")
                return None

            response = self.session.get(url, headers=headers, timeout=self.request_timeout)
            
            if response.status_code == 404 and "v0.0.41" not in url:
                fallback_url = url.replace("v0.0.44", "v0.0.41")
                logger.warning(f"Slurm Version Mismatch! Retrying with v0.0.41")
                response = self.session.get(fallback_url, headers=headers, timeout=self.request_timeout)
            
            response.raise_for_status()
            self.last_error = None
            return response.json()
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Slurm REST API GET Error ({endpoint}): {e}")
            return None

    def _run_slurm_cmd(self, cmd: List[str]) -> Optional[str]:
        try:
            return subprocess.check_output(
                cmd,
                env=get_slurm_env(),
                stderr=subprocess.STDOUT,
                timeout=self.request_timeout,
            ).decode()
        except Exception as e:
            logger.error(f"Slurm CLI fallback failed ({' '.join(cmd)}): {e}")
            if hasattr(e, "output"):
                try:
                    logger.error(f"Command Output: {e.output.decode()}")
                except Exception:
                    pass
            return None

    @staticmethod
    def _parse_cpu_summary(cpu_summary: str):
        try:
            allocated, idle, other, total = [int(part or 0) for part in cpu_summary.split("/")]
            return allocated, idle, other, total
        except Exception:
            return 0, 0, 0, 0

    @staticmethod
    def _parse_int(value, default=0):
        try:
            if value is None:
                return default
            return int(float(str(value).strip()))
        except Exception:
            return default

    def _get_nodes_from_sinfo(self) -> List[Dict[str, Any]]:
        output = self._run_slurm_cmd([
            "sinfo",
            "-N",
            "-h",
            "-o",
            "%N|%T|%C|%m|%e|%O|%G|%V",
        ])
        if not output:
            return []

        nodes = []
        for line in output.splitlines():
            parts = line.split("|")
            if len(parts) < 8:
                continue
            name, state, cpus, memory, free_mem, cpu_load, gres, version = parts[:8]
            allocated, _idle, _other, total = self._parse_cpu_summary(cpus)
            nodes.append({
                "name": name.strip(),
                "node_name": name.strip(),
                "node_state": [state.strip().lower()],
                "cpus": total,
                "alloc_cpus": allocated,
                "real_memory": self._parse_int(memory),
                "free_mem": self._parse_int(free_mem),
                "alloc_memory": max(0, self._parse_int(memory) - self._parse_int(free_mem)),
                "cpu_load": self._parse_int(cpu_load),
                "gres": gres.strip(),
                "version": version.strip(),
                "operating_system": "Linux (Slurm CLI)",
            })
        return nodes

    @staticmethod
    def _expand_node_names(value: str) -> List[str]:
        value = value.strip()
        match = re.search(r"^(.*)\[(\d+)-(\d+)\](.*)$", value)
        if not match:
            return [value]
        prefix, start, end, suffix = match.groups()
        width = len(start)
        return [f"{prefix}{str(num).zfill(width)}{suffix}" for num in range(int(start), int(end) + 1)]

    @staticmethod
    def _parse_slurm_conf_tokens(line: str) -> Dict[str, str]:
        tokens = {}
        for token in line.split():
            if "=" in token:
                key, value = token.split("=", 1)
                tokens[key] = value
        return tokens

    def _get_nodes_from_slurm_conf(self) -> List[Dict[str, Any]]:
        conf_path = os.getenv("SLURM_CONF", "/etc/slurm/slurm.conf")
        if not os.path.exists(conf_path):
            return []

        nodes = []
        try:
            with open(conf_path, "r") as conf:
                for raw_line in conf:
                    line = raw_line.split("#", 1)[0].strip()
                    if not line.startswith("NodeName="):
                        continue
                    tokens = self._parse_slurm_conf_tokens(line)
                    node_expr = tokens.get("NodeName", "")
                    if not node_expr or node_expr.upper() == "DEFAULT":
                        continue
                    for name in self._expand_node_names(node_expr):
                        nodes.append({
                            "name": name,
                            "node_name": name,
                            "address": tokens.get("NodeAddr"),
                            "node_state": [tokens.get("State", "unknown").lower()],
                            "cpus": self._parse_int(tokens.get("CPUs")),
                            "alloc_cpus": 0,
                            "real_memory": self._parse_int(tokens.get("RealMemory")),
                            "free_mem": self._parse_int(tokens.get("RealMemory")),
                            "alloc_memory": 0,
                            "sockets": self._parse_int(tokens.get("Sockets")),
                            "cores": self._parse_int(tokens.get("CoresPerSocket")),
                            "threads_per_core": self._parse_int(tokens.get("ThreadsPerCore"), 1),
                            "gres": tokens.get("Gres", ""),
                            "operating_system": "Linux (slurm.conf)",
                            "slurm_version": "N/A",
                        })
        except Exception as e:
            logger.error(f"Failed to parse {conf_path}: {e}")
            return []

        return nodes

    def get_nodes(self) -> List[Dict[str, Any]]:
        nodes_list = self._get_nodes_from_sinfo()
        if not nodes_list:
            data = self._get("nodes")
            nodes_list = data.get("nodes", []) if data else []
        if not nodes_list:
            nodes_list = self._get_nodes_from_slurm_conf()
        if nodes_list:
            self.last_error = None
        
        # Ensure 'name' is populated for all nodes (fallback to node_name)
        for node in nodes_list:
            if "name" not in node and "node_name" in node:
                node["name"] = node["node_name"]
        return nodes_list

    def get_jobs(self) -> List[Dict[str, Any]]:
        output = self._run_slurm_cmd(["squeue", "-h", "-o", "%i|%u|%T"])
        if output:
            jobs = []
            for line in output.splitlines():
                parts = line.split("|")
                if len(parts) >= 3:
                    jobs.append({"job_id": parts[0], "user_name": parts[1], "job_state": parts[2]})
            return jobs

        data = self._get("jobs")
        return data.get("jobs", []) if data else []

    def get_diag(self) -> Optional[Dict[str, Any]]:
        return self._get("diag")

def get_slurm_env():
    """Build the environment dictionary for Slurm CLI calls."""
    env = os.environ.copy()
    env["PATH"] = f"{settings.SLURM_PATH}:{env.get('PATH', '')}"
    env["LD_LIBRARY_PATH"] = settings.SLURM_LIB_PATH
    return env

def get_slurm_jwt():
    """Proxy for the client's JWT getter."""
    return slurm_client._get_jwt()

slurm_client = SlurmReadOnlyClient()
