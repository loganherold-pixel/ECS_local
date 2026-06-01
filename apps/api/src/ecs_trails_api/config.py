from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = Field(default="ecs-vehicle-trails-api", alias="ECS_SERVICE_NAME")
    service_version: str = Field(default="0.1.0", alias="ECS_SERVICE_VERSION")
    environment: str = Field(default="local", alias="ECS_ENVIRONMENT")
    database_url: str = Field(
        default="postgresql+psycopg://ecs_trails:ecs_trails@localhost:5432/ecs_trails",
        alias="DATABASE_URL",
    )
    mapbox_access_token: str = Field(default="", alias="MAPBOX_ACCESS_TOKEN")
    ridb_api_key: str = Field(default="", alias="RIDB_API_KEY")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
