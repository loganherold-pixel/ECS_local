# ECS Trail System Infrastructure

This folder contains local infrastructure for the ECS Vehicle Trail System scaffold.

- `postgres/init/001_enable_postgis.sql` enables PostGIS when the local database volume is first created.
- Root `docker-compose.yml` starts PostGIS, the FastAPI API, and the Next.js web app.

Container weather configuration:

- National Weather Service requests use `NWS_API_BASE_URL=https://api.weather.gov`.
- NWS requires `NWS_USER_AGENT` for the HTTP `User-Agent` header; it does not require an API key.
- Keep `NWS_ACCEPT=application/geo+json` unless a tested NWS response contract requires changing it.
- `ecs/ecs5-task-definition.json` is the ECS runtime task definition template for provider config.
- `AIRNOW_API_KEY` and `NPS_API_KEY` must be injected through the ECS container `secrets` block from AWS Secrets Manager or SSM Parameter Store.
- Keep `AIRNOW_ENABLED`, `NPS_ENABLED`, `AIRNOW_API_BASE_URL`, and `NPS_API_BASE_URL` in the normal ECS `environment` block because they are not secrets.

The API also has an Alembic migration that enables PostGIS so non-Docker databases can be migrated with the same baseline.
