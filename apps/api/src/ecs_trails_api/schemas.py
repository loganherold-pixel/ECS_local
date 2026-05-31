from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    status: str
    service: str

    model_config = ConfigDict(extra="forbid")


class SystemInfoResponse(BaseModel):
    service: str
    version: str
    environment: str

    model_config = ConfigDict(extra="forbid")
