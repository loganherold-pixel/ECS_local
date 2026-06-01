import anyio
import httpx

from ecs_trails_api.main import app


def get(path: str) -> httpx.Response:
    async def request() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.get(path)

    return anyio.run(request)


def test_healthz_returns_ok_without_external_dependencies() -> None:
    response = get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "ecs-vehicle-trails-api",
    }


def test_system_info_returns_service_version_and_environment() -> None:
    response = get("/v1/system/info")

    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "ecs-vehicle-trails-api"
    assert payload["version"] == "0.1.0"
    assert payload["environment"]
