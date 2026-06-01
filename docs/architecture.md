# ECS Vehicle Trail System Architecture

## Core Rule

Mapbox is not the legal authority for vehicle trail access. ECS owns trail source ingestion, trail legality, vehicle access rules, seasonal access rules, source confidence, closure overrides, the off-road routable graph, and active off-road guidance.

## Initial Scaffold

- `apps/api` is a Python 3.12 FastAPI service with SQLAlchemy 2.x, Pydantic v2, GeoAlchemy2, Alembic, and pytest.
- `apps/web` is a Next.js and TypeScript app that displays scaffold readiness and checks the API health endpoint.
- `packages/shared` holds shared trail access labels and routeability constants.
- `infra` holds local PostGIS initialization.

## Legal Access Posture

Trail segments must never be routed as vehicle-usable unless ECS classifies them as `legal_verified` or `limited_verified` and the active request passes vehicle, date, and access checks. Geometry-only or community-unverified trail data can support discovery and review, but it is not routable by default. Closed or prohibited segments are never routable.

## Source Posture

The initial authoritative source targets are USFS MVUM Roads, USFS MVUM Trails, and BLM GTLF public motorized roads and trails. OSM can supplement geometry or discovery workflows, but OSM alone does not establish legal vehicle access.

The route catalog also treats official Forest Service alerts and current-condition pages as closure/conflict overlays. These sources can remove a matched route from public recommendation, but they do not prove that unmatched routes are open, passable, safe, or free of local hazards.

BLM GTLF ingestion starts as official source-segment evidence only. GTLF segments remain out of public Suggested Routes until ECS route aggregation, current-condition checks, and review produce a curated route record.
