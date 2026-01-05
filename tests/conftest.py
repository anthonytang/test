"""
Pytest configuration and fixtures for end-to-end tests.
"""

import os
import sys
import pytest
from pathlib import Path
from dotenv import load_dotenv
from fastapi.testclient import TestClient

# Add backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Load test environment variables BEFORE importing any backend modules
env_test_path = Path(__file__).parent / ".env.test"
load_dotenv(env_test_path, override=True)

# Now import backend modules
from server import app


@pytest.fixture(scope="session")
def test_app():
    """FastAPI application instance for testing."""
    return app


@pytest.fixture(scope="function")
def client(test_app):
    """
    FastAPI TestClient for making HTTP requests.

    Usage:
        def test_endpoint(client):
            response = client.get("/health")
            assert response.status_code == 200
    """
    with TestClient(test_app) as client:
        yield client


@pytest.fixture(scope="session")
def test_user_id():
    """Test user ID for namespacing test data."""
    return "test-user-e2e"


@pytest.fixture(scope="session")
def test_file_ids():
    """Placeholder for test file IDs (populated during tests)."""
    return {}
