import { afterEach, describe, expect, it } from "vitest";

import { getApiBaseUrl, getMapboxTokenStatus } from "../src/lib/runtime-config";

describe("runtime config", () => {
  const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalMapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = originalMapboxToken;
  });

  it("uses the local API default when no public API base URL is set", () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    expect(getApiBaseUrl()).toBe("http://localhost:8000");
  });

  it("reports only whether a Mapbox token is configured", () => {
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = "mapbox-token-placeholder";

    expect(getMapboxTokenStatus()).toBe("configured");
  });
});
