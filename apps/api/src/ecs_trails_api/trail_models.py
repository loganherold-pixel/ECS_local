from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ecs_trails_api.db import Base
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


def values_for_check(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def check_in(column_name: str, values: tuple[str, ...], constraint_name: str) -> CheckConstraint:
    return CheckConstraint(f"{column_name} IN ({values_for_check(values)})", name=constraint_name)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TrailSource(TimestampMixin, Base):
    __tablename__ = "trail_sources"
    __table_args__ = (
        check_in("source_type", TRAIL_SOURCE_TYPES, "trail_sources_source_type_valid"),
        check_in("authority_level", AUTHORITY_LEVELS, "trail_sources_authority_level_valid"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    source_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    source_name: Mapped[str] = mapped_column(Text, nullable=False)
    source_agency: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    authority_level: Mapped[str] = mapped_column(Text, nullable=False)
    homepage_url: Mapped[str | None] = mapped_column(Text)
    license_name: Mapped[str | None] = mapped_column(Text)
    attribution_text: Mapped[str | None] = mapped_column(Text)
    refresh_frequency: Mapped[str | None] = mapped_column(Text)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    ingest_runs: Mapped[list["SourceIngestRun"]] = relationship(back_populates="trail_source")


class SourceIngestRun(Base):
    __tablename__ = "source_ingest_runs"
    __table_args__ = (check_in("status", INGEST_STATUSES, "source_ingest_runs_status_valid"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    trail_source_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_sources.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(Text, nullable=False)
    source_uri: Mapped[str | None] = mapped_column(Text)
    source_version: Mapped[str | None] = mapped_column(Text)
    checksum: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    feature_count_raw: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    feature_count_normalized: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    trail_source: Mapped[TrailSource] = relationship(back_populates="ingest_runs")


class RawSourceFeature(Base):
    __tablename__ = "raw_source_features"
    __table_args__ = (
        Index("ix_raw_source_features_geometry", "geometry", postgresql_using="gist"),
        Index("ix_raw_source_features_source_feature_id", "source_feature_id"),
        Index("ix_raw_source_features_trail_source_id", "trail_source_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    trail_source_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_sources.id", ondelete="CASCADE"), nullable=False
    )
    ingest_run_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("source_ingest_runs.id", ondelete="CASCADE"), nullable=False
    )
    source_feature_id: Mapped[str] = mapped_column(Text, nullable=False)
    source_layer: Mapped[str | None] = mapped_column(Text)
    geometry: Mapped[str] = mapped_column(Geometry("GEOMETRY", srid=4326), nullable=False)
    properties: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TrailSegment(TimestampMixin, Base):
    __tablename__ = "trail_segments"
    __table_args__ = (
        check_in("segment_type", SEGMENT_TYPES, "trail_segments_segment_type_valid"),
        check_in("surface", SURFACE_TYPES, "trail_segments_surface_valid"),
        check_in("legality_status", LEGALITY_STATUSES, "trail_segments_legality_status_valid"),
        check_in(
            "public_access_status",
            PUBLIC_ACCESS_STATUSES,
            "trail_segments_public_access_status_valid",
        ),
        Index("ix_trail_segments_geometry", "geometry", postgresql_using="gist"),
        Index("ix_trail_segments_legality_status", "legality_status"),
        Index("ix_trail_segments_public_access_status", "public_access_status"),
        Index("ix_trail_segments_primary_source_id", "primary_source_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    canonical_name: Mapped[str | None] = mapped_column(Text)
    route_number: Mapped[str | None] = mapped_column(Text)
    segment_type: Mapped[str] = mapped_column(Text, nullable=False, default="unknown")
    surface: Mapped[str] = mapped_column(Text, nullable=False, default="unknown")
    legality_status: Mapped[str] = mapped_column(Text, nullable=False)
    public_access_status: Mapped[str] = mapped_column(Text, nullable=False, default="unknown")
    land_manager: Mapped[str | None] = mapped_column(Text)
    managing_unit: Mapped[str | None] = mapped_column(Text)
    confidence_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    source_priority: Mapped[int] = mapped_column(Integer, nullable=False)
    primary_source_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_sources.id"), nullable=False
    )
    primary_source_feature_id: Mapped[str] = mapped_column(Text, nullable=False)
    geometry: Mapped[str] = mapped_column(Geometry("MULTILINESTRING", srid=4326), nullable=False)
    length_meters: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    source_last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class TrailSegmentSource(Base):
    __tablename__ = "trail_segment_sources"
    __table_args__ = (
        check_in("source_role", SOURCE_ROLES, "trail_segment_sources_source_role_valid"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    trail_segment_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_segments.id", ondelete="CASCADE"), nullable=False
    )
    trail_source_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_sources.id"), nullable=False
    )
    raw_source_feature_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("raw_source_features.id")
    )
    source_feature_id: Mapped[str | None] = mapped_column(Text)
    match_confidence: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    source_role: Mapped[str] = mapped_column(Text, nullable=False)
    properties: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class VehicleAccessRule(TimestampMixin, Base):
    __tablename__ = "vehicle_access_rules"
    __table_args__ = (
        check_in("vehicle_class", VEHICLE_CLASSES, "vehicle_access_rules_vehicle_class_valid"),
        Index("ix_vehicle_access_rules_trail_segment_id", "trail_segment_id"),
        Index("ix_vehicle_access_rules_vehicle_class", "vehicle_class"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    trail_segment_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_segments.id", ondelete="CASCADE"), nullable=False
    )
    vehicle_class: Mapped[str] = mapped_column(Text, nullable=False)
    allowed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    season_start_month: Mapped[int | None] = mapped_column(Integer)
    season_start_day: Mapped[int | None] = mapped_column(Integer)
    season_end_month: Mapped[int | None] = mapped_column(Integer)
    season_end_day: Mapped[int | None] = mapped_column(Integer)
    permit_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    width_limit_inches: Mapped[Decimal | None] = mapped_column(Numeric)
    notes: Mapped[str | None] = mapped_column(Text)
    source_text: Mapped[str | None] = mapped_column(Text)


class TrailNode(Base):
    __tablename__ = "trail_nodes"
    __table_args__ = (Index("ix_trail_nodes_geometry", "geometry", postgresql_using="gist"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    geometry: Mapped[str] = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TrailEdge(Base):
    __tablename__ = "trail_edges"
    __table_args__ = (
        Index("ix_trail_edges_geometry", "geometry", postgresql_using="gist"),
        Index("ix_trail_edges_from_node_id", "from_node_id"),
        Index("ix_trail_edges_to_node_id", "to_node_id"),
        Index("ix_trail_edges_trail_segment_id", "trail_segment_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    from_node_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_nodes.id"), nullable=False
    )
    to_node_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_nodes.id"), nullable=False
    )
    trail_segment_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_segments.id"), nullable=False
    )
    geometry: Mapped[str] = mapped_column(Geometry("LINESTRING", srid=4326), nullable=False)
    length_meters: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    bidirectional: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cost_base: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class CuratedRoute(TimestampMixin, Base):
    __tablename__ = "curated_routes"
    __table_args__ = (
        check_in("status", ROUTE_STATUSES, "curated_routes_status_valid"),
        check_in("difficulty", DIFFICULTIES, "curated_routes_difficulty_valid"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    route_slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(Text, nullable=False, default="unknown")
    recommended_vehicle_class: Mapped[str | None] = mapped_column(Text)
    geometry: Mapped[str] = mapped_column(Geometry("MULTILINESTRING", srid=4326), nullable=False)
    distance_meters: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    source_summary: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class CuratedRouteSegment(Base):
    __tablename__ = "curated_route_segments"
    __table_args__ = (
        check_in("direction", ROUTE_DIRECTIONS, "curated_route_segments_direction_valid"),
        UniqueConstraint("curated_route_id", "sequence_index", name="uq_curated_route_sequence"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    curated_route_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("curated_routes.id", ondelete="CASCADE"), nullable=False
    )
    trail_segment_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_segments.id"), nullable=False
    )
    sequence_index: Mapped[int] = mapped_column(Integer, nullable=False)
    direction: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Closure(TimestampMixin, Base):
    __tablename__ = "closures"
    __table_args__ = (
        check_in("closure_type", CLOSURE_TYPES, "closures_closure_type_valid"),
        check_in("status", CLOSURE_STATUSES, "closures_status_valid"),
        Index("ix_closures_geometry", "geometry", postgresql_using="gist"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    closure_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    affected_segment_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("trail_segments.id")
    )
    geometry: Mapped[str | None] = mapped_column(Geometry("GEOMETRY", srid=4326))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_name: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)


class PoiCache(TimestampMixin, Base):
    __tablename__ = "poi_cache"
    __table_args__ = (
        check_in("provider", POI_PROVIDERS, "poi_cache_provider_valid"),
        Index("ix_poi_cache_geometry", "geometry", postgresql_using="gist"),
        Index("ix_poi_cache_provider_poi_id", "provider_poi_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    provider_poi_id: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    geometry: Mapped[str] = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    properties: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
