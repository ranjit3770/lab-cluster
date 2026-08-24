"""Parsers for Slurm CLI output values."""
import re


def _to_int(value, default=0):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return int(value)
    raw = str(value).strip()
    if not raw or raw.upper() in {"N/A", "NA", "NONE", "NULL", "UNKNOWN", "(NULL)"}:
        return default
    match = re.match(r"^-?\d+", raw)
    if not match:
        return default
    try:
        return int(match.group(0))
    except Exception:
        return default


def _parse_slurm_memory_to_gb(value, cpus=1):
    if value is None:
        return 0.0
    raw = str(value).strip()
    if not raw or raw.upper() in {"N/A", "NA", "NONE", "NULL", "UNKNOWN", "(NULL)"}:
        return 0.0

    per_cpu = raw.endswith("c")
    if per_cpu:
        raw = raw[:-1]

    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)([KMGTP]?)", raw, re.IGNORECASE)
    if not match:
        return 0.0

    amount = float(match.group(1))
    unit = match.group(2).upper() or "M"
    multiplier = {
        "K": 1 / (1024 * 1024),
        "M": 1 / 1024,
        "G": 1,
        "T": 1024,
        "P": 1024 * 1024,
    }.get(unit, 1 / 1024)

    gb = amount * multiplier
    if per_cpu:
        gb *= max(1, _to_int(cpus, 1))
    return gb


def _walltime_to_seconds(value, default_seconds=1800):
    try:
        parts = [int(part) for part in str(value or "").split(":")]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        if len(parts) == 1:
            return parts[0] * 60
    except Exception:
        pass
    return default_seconds


def _seconds_to_walltime(seconds):
    seconds = max(60, int(seconds))
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"
