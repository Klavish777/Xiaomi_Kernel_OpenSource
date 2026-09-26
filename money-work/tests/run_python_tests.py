import unittest
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
suite = unittest.defaultTestLoader.discover(start_dir=str(TESTS_DIR), pattern='test_*.py')
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
