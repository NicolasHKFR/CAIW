import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "mock_ai" in data


@pytest.mark.asyncio
async def test_list_projects_empty(client):
    resp = await client.get("/api/projects")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_project(client):
    resp = await client.post(
        "/api/projects",
        json={"name": "Test Project", "original_prompt": "90m2 apartment"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Project"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_settings(client):
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "mock_mode" in data
    assert "llm_provider" in data


@pytest.mark.asyncio
async def test_update_settings(client):
    resp = await client.put(
        "/api/settings",
        json={"mock_mode": False, "llm_provider": "ollama"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mock_mode"] is False
    assert data["llm_provider"] == "ollama"


@pytest.mark.asyncio
async def test_create_and_delete_project(client):
    create_resp = await client.post(
        "/api/projects",
        json={"name": "Delete Me", "original_prompt": "test"},
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["id"]

    delete_resp = await client.delete(f"/api/projects/{project_id}")
    assert delete_resp.status_code == 204

    get_resp = await client.get(f"/api/projects/{project_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_create_project_invalid_body(client):
    resp = await client.post("/api/projects", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_nonexistent_project(client):
    resp = await client.get("/api/projects/nonexistent-id")
    assert resp.status_code == 404
