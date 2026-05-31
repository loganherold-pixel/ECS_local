from fastapi import FastAPI

from ecs_trails_api.config import get_settings
from ecs_trails_api.schemas import HealthResponse, SystemInfoResponse

settings = get_settings()

app = FastAPI(
    title="ECS Vehicle Trail System API",
    version=settings.service_version,
    docs_url="/docs",
    openapi_url="/openapi.json",
)


@app.get("/healthz", response_model=HealthResponse)
def healthz() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.service_name)


@app.get("/v1/system/info", response_model=SystemInfoResponse)
def system_info() -> SystemInfoResponse:
    return SystemInfoResponse(
        service=settings.service_name,
        version=settings.service_version,
        environment=settings.environment,
    )
