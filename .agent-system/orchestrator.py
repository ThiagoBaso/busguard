"""CLI independente da aplicação BusGuard (Python 3.12+)."""
import sys

if sys.version_info < (3, 12):
    raise SystemExit("O sistema multiagente exige Python 3.12 ou superior.")

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

from agent_system.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
