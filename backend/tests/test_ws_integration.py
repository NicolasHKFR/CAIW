import json
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_websocket_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_websocket_chat_invalid_project():
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as test_client:
        with test_client.websocket_connect("/api/ws/chat") as ws:
            ws.send_json({"project_id": "nonexistent", "message": "test"})
            data = ws.receive_json()
            assert data["event"] == "error"


@pytest.mark.asyncio
async def test_websocket_chat_mock_flow():
    from fastapi.testclient import TestClient
    from app.main import app as fastapi_app
    from app.core.config import settings

    original_mock = settings.mock_ai
    settings.mock_ai = True

    try:
        resp = await _create_project()
        project_id = resp["id"]

        with TestClient(fastapi_app) as test_client:
            with test_client.websocket_connect("/api/ws/chat") as ws:
                ws.send_json({"project_id": project_id, "message": "90m2 apartment"})
                events = []
                while True:
                    data = ws.receive_json()
                    events.append(data["event"])
                    if data["event"] in ("complete", "error"):
                        break
                assert "progress" in events
                assert "complete" in events
                assert any(e == "progress" for e in events)
    finally:
        settings.mock_ai = original_mock


async def _create_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/projects",
            json={"name": "Test WS", "original_prompt": "90m2 apartment"},
        )
        return resp.json()
