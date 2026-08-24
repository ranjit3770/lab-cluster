"""Observability primitives: structured JSON logging and lightweight metrics.

Stdlib-only so the service stays dependency-free for CI. Enabled per-service
via environment variables:

    LOG_FORMAT=json     emit one JSON object per log line (default: plain)
    METRICS_ENABLED=1   expose Prometheus text metrics at /metrics
"""
import json
import logging
import re
import threading
import time


# ---------------------------------------------------------------------------
# Structured logging
# ---------------------------------------------------------------------------

class JsonFormatter(logging.Formatter):
    """Render log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "service": getattr(record, "service", "portal"),
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in ("request_id", "user_id", "job_id", "action", "status", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging(service_name: str, level: int = logging.INFO) -> None:
    """Idempotent root-logger setup with optional JSON output."""
    root = logging.getLogger()
    root.setLevel(level)
    handler = logging.StreamHandler()
    if _env_flag("LOG_FORMAT") == "json":
        formatter = JsonFormatter()
        # Inject the owning service into every record via a filter.
        handler.setFormatter(formatter)

        class _ServiceFilter(logging.Filter):
            def filter(self, record):
                record.service = getattr(record, "service", service_name)
                return True

        handler.addFilter(_ServiceFilter())
    else:
        handler.setFormatter(
            logging.Formatter(f"%(asctime)s {service_name} %(levelname)s %(name)s: %(message)s")
        )
    root.handlers.clear()
    root.addHandler(handler)


def _env_flag(name: str) -> str:
    import os

    return os.getenv(name, "").strip().lower()


# ---------------------------------------------------------------------------
# Metrics (Prometheus text exposition, stdlib only)
# ---------------------------------------------------------------------------

_SAFE_LABEL = re.compile(r"[^a-zA-Z0-9_]")


class Metrics:
    """Thread-safe counters/histogram registry rendered in Prometheus format."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[str, float] = {}
        self._histograms: dict[str, list[float]] = {}
        self._buckets = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)

    @staticmethod
    def _key(name: str, labels: dict | None) -> str:
        if not labels:
            return name
        label_str = ",".join(
            f'{_SAFE_LABEL.sub("_", k)}="{_SAFE_LABEL.sub("_", str(v))}"'
            for k, v in sorted(labels.items())
        )
        return f"{name}{{{label_str}}}"

    def inc(self, name: str, value: float = 1.0, labels: dict | None = None) -> None:
        with self._lock:
            key = self._key(name, labels)
            self._counters[key] = self._counters.get(key, 0.0) + value

    def observe(self, name: str, value: float, labels: dict | None = None) -> None:
        base = self._key(name, labels)
        with self._lock:
            series = self._histograms.setdefault(base, [])
            series.append(value)

    def render(self) -> str:
        lines: list[str] = []
        with self._lock:
            counters = sorted(self._counters.items())
            histograms = {k: list(v) for k, v in self._histograms.items()}
        for key, total in counters:
            metric = key.split("{")[0]
            lines.append(f"# TYPE {metric} counter")
            lines.append(f"{key} {total}")
        for base, values in sorted(histograms.items()):
            metric = base.split("{")[0]
            lines.append(f"# TYPE {metric} histogram")
            cumulative = 0
            for bound in (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0):
                count = sum(1 for v in values if v <= bound)
                lines.append(f'{base}_bucket{{le="{bound}"}} {count}')
                cumulative = count
            lines.append(f'{base}_bucket{{le="+Inf"}} {len(values)}')
            lines.append(f"{base}_sum {sum(values)}")
            lines.append(f"{base}_count {len(values)}")
        return "\n".join(lines) + "\n"


metrics = Metrics()


async def metrics_middleware(app, request, call_next):
    """Record request count and latency for every HTTP route."""
    started = time.perf_counter()
    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception:
        status_code = 500
        raise
    finally:
        duration = time.perf_counter() - started
        route = request.scope.get("route")
        path_template = getattr(route, "path", request.url.path)
        labels = {"method": request.method, "path": path_template, "status": str(status_code)}
        metrics.inc("http_requests_total", labels=labels)
        metrics.observe("http_request_duration_seconds", duration, labels={
            "method": request.method,
            "path": path_template,
        })
    return response
