from uuid import UUID, uuid4

from geoalchemy2 import Geometry

from ecs_trails_api.db import Base
from ecs_trails_api.trail_schemas import TrailSegmentRead, TrailSourceRead
from ecs_trails_api.trail_seed_data import TRAIL_SOURCE_SEEDS


def test_trail_domain_models_register_required_tables() -> None:
    from ecs_trails_api import trail_models  # noqa: F401

    expected_tables = {
        "trail_sources",
        "source_ingest_runs",
        "raw_source_features",
        "trail_segments",
        "trail_segment_sources",
        "vehicle_access_rules",
        "trail_nodes",
        "trail_edges",
        "curated_routes",
        "curated_route_segments",
        "closures",
        "poi_cache",
    }

    assert expected_tables.issubset(Base.metadata.tables)


def test_geospatial_tables_use_postgis_geometry_columns() -> None:
    from ecs_trails_api import trail_models  # noqa: F401

    geometry_expectations = {
        "raw_source_features": "GEOMETRY",
        "trail_segments": "MULTILINESTRING",
        "trail_nodes": "POINT",
        "trail_edges": "LINESTRING",
        "curated_routes": "MULTILINESTRING",
        "closures": "GEOMETRY",
        "poi_cache": "POINT",
    }

    for table_name, geometry_type in geometry_expectations.items():
        column_type = Base.metadata.tables[table_name].c.geometry.type
        assert isinstance(column_type, Geometry)
        assert column_type.geometry_type == geometry_type
        assert column_type.srid == 4326


def test_seed_sources_include_authoritative_and_supplemental_inputs() -> None:
    seed_by_key = {seed.source_key: seed for seed in TRAIL_SOURCE_SEEDS}

    assert set(seed_by_key) == {
        "usfs_mvum_roads",
        "usfs_mvum_trails",
        "blm_gtlf_roads",
        "blm_gtlf_trails",
        "osm_supplemental",
    }
    assert seed_by_key["usfs_mvum_roads"].authority_level == "primary_authoritative"
    assert seed_by_key["blm_gtlf_trails"].source_type == "blm_gtlf"
    assert seed_by_key["osm_supplemental"].authority_level == "supplemental"


def test_core_pydantic_schemas_validate_safety_fields() -> None:
    source_id = uuid4()
    segment_id = uuid4()

    source = TrailSourceRead(
        id=source_id,
        source_key="usfs_mvum_roads",
        source_name="USFS MVUM Roads",
        source_agency="USFS",
        source_type="usfs_mvum",
        authority_level="primary_authoritative",
    )
    segment = TrailSegmentRead(
        id=segment_id,
        legality_status="limited_verified",
        public_access_status="limited",
        confidence_score=88,
        source_priority=10,
        primary_source_id=source.id,
    )

    assert isinstance(source.id, UUID)
    assert segment.legality_status == "limited_verified"
    assert segment.public_access_status == "limited"
    assert segment.primary_source_id == source_id
