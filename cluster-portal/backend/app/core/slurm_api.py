import logging
import requests_unixsocket  # Changed from import requests
from typing import Optional, Dict, Any, List
from app.core.config import settings

logger = logging.getLogger(__name__)

class SlurmReadOnlyClient:
    """
    Client for read-only operations using the Slurm REST API.
    Used for dashboard and status monitoring via Unix Socket.
    """
    def __init__(self):
        # Initialize a session that supports unix sockets
        self.session = requests_unixsocket.Session()
        self.base_url = settings.SLURM_REST_URL
        self.headers = {
            "Content-Type": "application/json"
        }
        # Authenticated headers: Only send if a token is provided.
        if settings.SLURM_TOKEN:
            self.headers["X-SLURM-USER-TOKEN"] = settings.SLURM_TOKEN
            self.headers["X-SLURM-USER-NAME"] = settings.SLURM_USER or "slurm"
        else:
            # For peer-based local auth (sudo/root access to socket), 
            # we must NOT send user headers or Slurm will expect a JWT token.
            pass

    def _get(self, endpoint: str) -> Optional[Dict[str, Any]]:
        base_url = settings.SLURM_REST_URL.strip() if settings.SLURM_REST_URL else ""
        url = f"{base_url}/{endpoint}"
        try:
            # Use self.session instead of requests
            response = self.session.get(url, headers=self.headers, timeout=5)
            
            # If 404 and configured for high version, try fallback to v0.0.41 (Workstation Standard)
            if response.status_code == 404 and "v0.0.41" not in url:
                fallback_url = url.replace("v0.0.44", "v0.0.41")
                logger.warning(f"Slurm Version Mismatch (404)! Retrying with v0.0.41: {fallback_url}")
                response = self.session.get(fallback_url, headers=self.headers, timeout=5)
            
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Slurm REST API GET Error ({endpoint}): {e}")
            return None

    def get_nodes(self) -> List[Dict[str, Any]]:
        data = self._get("nodes")
        return data.get("nodes", []) if data else []

    def get_jobs(self) -> List[Dict[str, Any]]:
        data = self._get("jobs")
        return data.get("jobs", []) if data else []

    def get_diag(self) -> Optional[Dict[str, Any]]:
        return self._get("diag")

slurm_client = SlurmReadOnlyClient()
