# ECS Trail System Infrastructure

This folder contains local infrastructure for the ECS Vehicle Trail System scaffold.

- `postgres/init/001_enable_postgis.sql` enables PostGIS when the local database volume is first created.
- Root `docker-compose.yml` starts PostGIS, the FastAPI API, and the Next.js web app.

The API also has an Alembic migration that enables PostGIS so non-Docker databases can be migrated with the same baseline.
