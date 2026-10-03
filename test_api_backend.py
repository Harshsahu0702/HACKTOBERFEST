#!/usr/bin/env python
"""
test_api_backend.py

Unified test entry point for SIH 2026 Traffic Intelligence & Plate-Based Journey API.
Executes the full 14-test suite defined in tests/test_api_endpoints.py.
"""

from tests.test_api_endpoints import run_all_tests

if __name__ == "__main__":
    run_all_tests()
