export type TrailAccessClassification =
  | "legal_verified"
  | "limited_verified"
  | "geometry_only"
  | "community_unverified"
  | "closed_or_prohibited";

export const TRAIL_ACCESS_LABELS: Record<TrailAccessClassification, string> = {
  legal_verified: "Verified motorized access",
  limited_verified: "Limited / seasonal motorized access",
  geometry_only: "Geometry only - access not verified",
  community_unverified: "Source verification needed",
  closed_or_prohibited: "Closed or prohibited",
};

export const ROUTABLE_TRAIL_ACCESS: TrailAccessClassification[] = [
  "legal_verified",
  "limited_verified",
];

export const TRAIL_LEGAL_AUTHORITY_NOTICE =
  "ECS owns trail legality and Mapbox is not the legal trail authority.";
