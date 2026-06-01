"use client";

import { useEffect, useState } from "react";

import { getApiBaseUrl } from "@/lib/runtime-config";

type HealthState =
  | { label: "Checking"; detail: string }
  | { label: "Online"; detail: string }
  | { label: "Offline"; detail: string };

export function ApiHealthStatus() {
  const [health, setHealth] = useState<HealthState>({
    label: "Checking",
    detail: "Waiting for /healthz",
  });

  useEffect(() => {
    const controller = new AbortController();
    const apiBaseUrl = getApiBaseUrl();

    async function checkHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/healthz`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          setHealth({
            label: "Offline",
            detail: `API returned HTTP ${response.status}`,
          });
          return;
        }

        const payload = (await response.json()) as {
          service?: string;
          status?: string;
        };
        setHealth({
          label: "Online",
          detail: `${payload.service ?? "ecs-vehicle-trails-api"}: ${payload.status ?? "ok"}`,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setHealth({
          label: "Offline",
          detail:
            error instanceof Error ? error.message : "Health check failed",
        });
      }
    }

    void checkHealth();

    return () => controller.abort();
  }, []);

  return (
    <section
      className="panel status-panel"
      aria-labelledby="api-health-heading"
    >
      <div>
        <p className="eyebrow">API</p>
        <h2 id="api-health-heading">Health Check</h2>
      </div>
      <div className={`status-pill status-${health.label.toLowerCase()}`}>
        {health.label}
      </div>
      <p className="status-detail">{health.detail}</p>
    </section>
  );
}
