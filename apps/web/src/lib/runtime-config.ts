export type TokenStatus = "configured" | "missing";

export function getApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  return configuredUrl || "http://localhost:8000";
}

export function getMapboxTokenStatus(): TokenStatus {
  return process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim()
    ? "configured"
    : "missing";
}
