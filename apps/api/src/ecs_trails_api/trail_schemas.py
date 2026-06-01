from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ecs_trails_api.trail_constants import (
    AUTHORITY_LEVELS,
    CLOSURE_STATUSES,
    CLOSURE_TYPES,
    DIFFICULTIES,
    INGEST_STATUSES,
    LEGALITY_STATUSES,
    POI_PROVIDERS,
    PUBLIC_ACCESS_STATUSES,
    ROUTE_DIRECTIONS,
    ROUTE_STATUSES,
    SEGMENT_TYPES,
    SOURCE_ROLES,
    SURFACE_TYPES,
    TRAIL_SOURCE_TYPES,
    VEHICLE_CLASSES,
)

TrailSourceType = Literal[TRAIL_SOURCE_TYPES]
AuthorityLevel = Literal[AUTHORITY_LEVELS]
IngestStatus = Literal[INGEST_STATUSES]
SegmentType = Literal[SEGMENT_TYPES]
SurfaceType = Literal[SURFACE_TYPES]
LegalityStatus = Literal[LEGALITY_STATUSES]
PublicAccessStatus = Literal[PUBLIC_ACCESS_STATUSES]
SourceRole = Literal[SOURCE_ROLES]
VehicleClass = Literal[VEHICLE_CLASSES]
RouteStatus = Literal[ROUTE_STATUSES]
Difficulty = Literal[DIFFICULTIES]
RouteDirection = Literal[ROUTE_DIRECTIONS]
ClosureType = Literal[CLOSURE_TYPES]
ClosureStatus = Literal[CLOSURE_STATUSES]
PoiProvider = Literal[POI_PROVIDERS]


class EcsSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class TrailSourceRead(EcsSchema):
    id: UUID
    source_key: str
    source_name: str
    source_agency: str
    source_type: TrailSourceType
    authority_level: AuthorityLevel
    homepage_url: str | None = None
    license_name: str | None = None
    attribution_text: str | None = None
    refresh_frequency: str | None = None
    last_checked_at: datetime | None = None


class SourceIngestRunRead(EcsSchema):
    id: UUID
    trail_source_id: UUID
    status: IngestStatus
    source_uri: str | None = None
    source_version: str | None = None
    checksum: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
    feature_count_raw: int = 0
    feature_count_normalized: int = 0
    error_message: str | None = None
    metadata_json: dict = Field(default_factory=dict)


class RawSourceFeatureRead(EcsSchema):
    id: UUID
    trail_source_id: UUID
    ingest_run_id: UUID
    source_feature_id: str
    source_layer: str | None = None
    properties: dict = Field(default_factory=dict)
    created_at: datetime | None = None


class TrailSegmentRead(EcsSchema):
    id: UUID
    canonical_name: str | None = None
    route_number: str | None = None
    segment_type: SegmentType = "unknown"
    surface: SurfaceType = "unknown"
    legality_status: LegalityStatus
    public_access_status: PublicAccessStatus = "unknown"
    land_manager: str | None = None
    managing_unit: str | None = None
    confidence_score: Decimal
    source_priority: int
    primary_source_id: UUID
    primary_source_feature_id: str | None = None
    length_meters: Decimal | None = None
    source_last_updated: datetime | None = None
    ingested_at: datetime | None = None
    metadata_json: dict = Field(default_factory=dict)


class TrailSegmentSourceRead(EcsSchema):
    id: UUID
    trail_segment_id: UUID
    trail_source_id: UUID
    raw_source_feature_id: UUID | None = None
    source_feature_id: str | None = None
    match_confidence: Decimal
    source_role: SourceRole
    properties: dict = Field(default_factory=dict)


class VehicleAccessRuleRead(EcsSchema):
    id: UUID
    trail_segment_id: UUID
    vehicle_class: VehicleClass
    allowed: bool
    season_start_month: int | None = None
    season_start_day: int | None = None
    season_end_month: int | None = None
    season_end_day: int | None = None
    permit_required: bool = False
    width_limit_inches: Decimal | None = None
    notes: str | None = None
    source_text: str | None = None


class TrailNodeRead(EcsSchema):
    id: UUID
    created_at: datetime | None = None


class TrailEdgeRead(EcsSchema):
    id: UUID
    from_node_id: UUID
    to_node_id: UUID
    trail_segment_id: UUID
    length_meters: Decimal
    bidirectional: bool = True
    cost_base: Decimal
    metadata_json: dict = Field(default_factory=dict)


class CuratedRouteRead(EcsSchema):
    id: UUID
    route_slug: str
    name: str
    description: str | None = None
    status: RouteStatus
    difficulty: Difficulty = "unknown"
    recommended_vehicle_class: str | None = None
    distance_meters: Decimal
    source_summary: dict = Field(default_factory=dict)


class CuratedRouteSegmentRead(EcsSchema):
    id: UUID
    curated_route_id: UUID
    trail_segment_id: UUID
    sequence_index: int
    direction: RouteDirection
    created_at: datetime | None = None


class ClosureRead(EcsSchema):
    id: UUID
    title: str
    description: str | None = None
    closure_type: ClosureType
    status: ClosureStatus
    affected_segment_id: UUID | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    source_name: str | None = None
    source_url: str | None = None


class PoiCacheRead(EcsSchema):
    id: UUID
    provider: PoiProvider
    provider_poi_id: str
    category: str
    name: str
    properties: dict = Field(default_factory=dict)
    expires_at: datetime | None = None
