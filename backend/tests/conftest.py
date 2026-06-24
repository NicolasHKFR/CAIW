import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import init_db


@pytest.fixture(autouse=True)
async def init_test_db():
    await init_db()
    yield
