TRAIL_SOURCE_TYPES = (
    "usfs_mvum",
    "blm_gtlf",
    "osm",
    "state",
    "county",
    "nps",
    "mapbox_context",
    "user",
    "other",
)

AUTHORITY_LEVELS = (
    "primary_authoritative",
    "secondary_authoritative",
    "supplemental",
    "community",
    "unknown",
)

INGEST_STATUSES = ("pending", "running", "succeeded", "failed")

SEGMENT_TYPES = ("road", "trail", "track", "connector", "ferry", "unknown")

SURFACE_TYPES = ("paved", "gravel", "dirt", "sand", "rock", "snow", "mixed", "unknown")

LEGALITY_STATUSES = (
    "legal_verified",
    "limited_verified",
    "geometry_only",
    "community_unverified",
    "closed_or_prohibited",
)

PUBLIC_ACCESS_STATUSES = ("open", "limited", "closed", "unknown")

SOURCE_ROLES = ("primary", "corroborating", "conflicting", "supplemental")

VEHICLE_CLASSES = (
    "highway_legal_4x4",
    "full_size_4x4",
    "atv",
    "utv",
    "motorcycle",
    "snowmobile",
    "bicycle",
    "pedestrian",
    "unknown",
)

ROUTE_STATUSES = ("draft", "qa", "published", "archived")

DIFFICULTIES = ("easy", "moderate", "difficult", "extreme", "unknown")

ROUTE_DIRECTIONS = ("forward", "reverse", "either")

CLOSURE_TYPES = (
    "seasonal",
    "emergency",
    "fire",
    "flood",
    "maintenance",
    "land_manager",
    "permanent",
    "unknown",
)

CLOSURE_STATUSES = ("active", "scheduled", "expired", "unknown")

POI_PROVIDERS = ("mapbox", "ridb", "ecs", "other")
