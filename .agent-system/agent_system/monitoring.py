from __future__ import annotations

import csv
import ctypes
import io
import os
import threading
import time
from pathlib import Path

from .errors import AgentError
from .process import executable, run_process


def gpu_snapshot(runner=run_process) -> dict:
    try:
        command = [executable("nvidia-smi"), "--query-gpu=index,name,memory.total,memory.free,memory.used,utilization.gpu", "--format=csv,noheader,nounits"]
        result = runner(command, cwd=Path.cwd(), timeout=5)
        devices = []
        for row in csv.reader(io.StringIO(result.stdout)):
            if len(row) != 6:
                continue
            def number(value):
                try:
                    return float(value.strip())
                except ValueError:
                    return None
            devices.append({"index": row[0].strip(), "name": row[1].strip(), "total_mib": number(row[2]), "free_mib": number(row[3]), "used_mib": number(row[4]), "utilization_percent": number(row[5])})
        return {"available": bool(devices), "devices": devices, "error": None if devices else "Nenhuma GPU NVIDIA detectada."}
    except (AgentError, OSError, ValueError) as exc:
        return {"available": False, "devices": [], "error": str(exc)}


def ram_snapshot() -> dict | None:
    if os.name == "nt":
        class MemoryStatus(ctypes.Structure):
            _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [(name, ctypes.c_ulonglong) for name in ("total_phys", "avail_phys", "total_page", "avail_page", "total_virtual", "avail_virtual", "avail_extended")]
        status = MemoryStatus()
        status.length = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return {"total_bytes": status.total_phys, "available_bytes": status.avail_phys, "used_bytes": status.total_phys - status.avail_phys}
    elif Path("/proc/meminfo").exists():
        values = {line.split(":")[0]: int(line.split()[1]) * 1024 for line in Path("/proc/meminfo").read_text().splitlines()}
        total, available = values.get("MemTotal"), values.get("MemAvailable")
        if total is not None and available is not None:
            return {"total_bytes": total, "available_bytes": available, "used_bytes": total - available}
    return None


class ResourceMonitor:
    def __init__(self, config: dict, sampler=gpu_snapshot):
        self.config, self.sampler = config, sampler
        self.samples = []
        self.stop_event = threading.Event()
        self.thread = None
        self.started = time.monotonic()

    def sample(self, phase):
        self.samples.append({"phase": phase, "elapsed_seconds": time.monotonic() - self.started, "gpu": self.sampler() if self.config["gpu"] else None, "ram": ram_snapshot() if self.config["ram"] else None})

    def __enter__(self):
        self.sample("before")
        def poll():
            while not self.stop_event.wait(self.config["interval_seconds"]):
                self.sample("during")
        self.thread = threading.Thread(target=poll, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.stop_event.set()
        self.thread.join(timeout=10)
        self.sample("after")

    def summary(self):
        peaks = {}
        ram_peak = None
        for sample in self.samples:
            for device in (sample.get("gpu") or {}).get("devices", []):
                used = device.get("used_mib")
                if used is not None:
                    peaks[device["index"]] = max(peaks.get(device["index"], 0), used)
            ram = sample.get("ram")
            if ram:
                ram_peak = max(ram_peak or 0, ram["used_bytes"])
        return {"gpu_peak_used_mib": peaks, "ram_peak_system_used_bytes": ram_peak, "samples": self.samples, "model_gpu_distribution": None}
