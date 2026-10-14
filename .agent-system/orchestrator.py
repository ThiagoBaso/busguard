"""CLI independente da aplicação BusGuard (Python 3.12+)."""
import sys

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

from agent_system.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
