from dataclasses import dataclass


@dataclass(frozen=True)
class TrailSourceSeed:
    source_key: str
    source_name: str
    source_agency: str
    source_type: str
    authority_level: str
    homepage_url: str | None = None
    license_name: str | None = None
    attribution_text: str | None = None
    refresh_frequency: str | None = None


TRAIL_SOURCE_SEEDS: tuple[TrailSourceSeed, ...] = (
    TrailSourceSeed(
        source_key="usfs_mvum_roads",
        source_name="USFS MVUM Roads",
        source_agency="USFS",
        source_type="usfs_mvum",
        authority_level="primary_authoritative",
        homepage_url="https://www.fs.usda.gov/visit/maps/mvum",
        attribution_text="USDA Forest Service Motor Vehicle Use Maps",
        refresh_frequency="agency published schedule",
    ),
    TrailSourceSeed(
        source_key="usfs_mvum_trails",
        source_name="USFS MVUM Trails",
        source_agency="USFS",
        source_type="usfs_mvum",
        authority_level="primary_authoritative",
        homepage_url="https://www.fs.usda.gov/visit/maps/mvum",
        attribution_text="USDA Forest Service Motor Vehicle Use Maps",
        refresh_frequency="agency published schedule",
    ),
    TrailSourceSeed(
        source_key="blm_gtlf_roads",
        source_name="BLM GTLF Public Motorized Roads",
        source_agency="BLM",
        source_type="blm_gtlf",
        authority_level="primary_authoritative",
        homepage_url="https://www.blm.gov/services/geospatial/GISData",
        attribution_text="Bureau of Land Management GTLF",
        refresh_frequency="agency published schedule",
    ),
    TrailSourceSeed(
        source_key="blm_gtlf_trails",
        source_name="BLM GTLF Public Motorized Trails",
        source_agency="BLM",
        source_type="blm_gtlf",
        authority_level="primary_authoritative",
        homepage_url="https://www.blm.gov/services/geospatial/GISData",
        attribution_text="Bureau of Land Management GTLF",
        refresh_frequency="agency published schedule",
    ),
    TrailSourceSeed(
        source_key="osm_supplemental",
        source_name="OpenStreetMap Supplemental Geometry",
        source_agency="OSM",
        source_type="osm",
        authority_level="supplemental",
        homepage_url="https://www.openstreetmap.org",
        license_name="ODbL",
        attribution_text="OpenStreetMap contributors",
        refresh_frequency="supplemental cache refresh",
    ),
)
