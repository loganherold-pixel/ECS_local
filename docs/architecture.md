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

Current-condition overlays are deliberately separate from legal/source verification. A route can remain "Official access verified" while its current-condition posture is `not_assessed`, `watch`, or `blocked`; ECS must never treat verified access as proof that the route is currently open, advisable, or passable. Search, detail, preview, and Offline Prep surfaces carry the overlay as a distinct current-condition object with open-status and passability-status fields.

The route catalog summary report is the operator snapshot for live catalog health. It reports route counts by source, public-recommendation versus curation-only posture, stale source counts, failed latest sync areas, and last verified timestamps without exposing route geometry. Operators should treat public recommendation counts as browseable coverage, curation-only counts as review backlog, stale sources as refresh targets, failed sync areas as adapter/provider follow-up, and missing last-verified timestamps as evidence gaps. The report also emits an operator health posture: `healthy` for clean sampled source evidence, `watch` for stale or timestamp-gap follow-up, and `critical` when latest source sync failures require attention. The summary workflow runs after completed source-sync workflows regardless of upstream success so failed syncs can still be reflected in operator health instead of disappearing from reporting. It also gates on the triggering workflow conclusion itself, because a sync can fail before recording a failed ingest run in the catalog tables.

BLM GTLF ingestion stores official source-segment evidence and may publish bounded aggregate public recommendations only when deterministic access, limitation, geometry, vehicle-fit, closure, and source-match checks pass. Records retain visible warnings for current closures, limitations, seasonality, and trip-date verification.

USGS National Digital Trails ingestion starts as supplemental geometry and trail-context evidence only. USGS Trails records can help fill map/review context, but they do not establish legal motorized access and must stay out of public Suggested Routes until authoritative access overlays and review pass.

NPS Public Trails ingestion starts as official park visitor-use trail context. NPS trail-use geometry may become public recommendations only for bounded park-context pilots with visible current-alert, closure, permitted-use, and trip-date warnings; park geometry alone still does not prove current motorized access.

Michigan DNR ORV GPX ingestion treats official state route/trail geometry as public-recommendable only when the adapter can infer route kind, vehicle fit, minimum length, and source identity. Recommendations keep warnings for current DNR closures, permits, local rules, vehicle width/fit, and seasonal conditions.

Minnesota DNR OHV ingestion treats official state GeoPackage route/trail geometry as public-recommendable only when the adapter sees motorized-use fields, valid geometry, minimum length, and source identity. Recommendations keep warnings for current DNR closures, permits, local rules, vehicle class fit, seasonal conditions, and the dataset navigation caveat.

Oregon Department of Forestry OHV GPX ingestion starts with the official Tillamook State Forest Class I, Class II/IV, and Class III GPX files. ODF records may become public recommendations only with vehicle-class fit, valid geometry, source identity, minimum length, and visible warnings for current open/closed status, fire restrictions, vehicle class signage, permits, local rules, and seasonal conditions.

Colorado CPW Designated Trails ingestion starts with the official Colorado Parks & Wildlife FeatureServer layer. CPW records may become public recommendations only when the source marks motorized uses such as motorcycle, ATV, OHV over 50 inches, or highway vehicle use, and every recommendation keeps warnings for current closures, permits, trail signage, property rules, weather, fire restrictions, and seasonal conditions.

BDR and other partner/licensed GPX sources are restricted by default. Keep those source rows disabled, and do not ingest, sync, rehost, or recommend their route geometry unless written partner permission or licensing is documented.

California State Parks Roads and Trails data is treated as partner-restricted metadata only because the published GIS page says commercial use requires advance approval. Keep the source disabled. Do not ingest, sync, rehost, or recommend California State Parks route geometry until ECS has documented commercial approval.
