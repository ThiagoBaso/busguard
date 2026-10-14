"""Runner confiável; os testes descobertos continuam sendo código não confiável."""
import sys
import unittest
from pathlib import Path

root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))
suite = unittest.defaultTestLoader.discover(str(root / "tests"))
if suite.countTestCases() == 0:
    print("Nenhum teste descoberto.", file=sys.stderr)
    raise SystemExit(2)
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
