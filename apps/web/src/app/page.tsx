import {
  ROUTABLE_TRAIL_ACCESS,
  TRAIL_ACCESS_LABELS,
  TRAIL_LEGAL_AUTHORITY_NOTICE,
} from "@ecs/shared";

import { ApiHealthStatus } from "@/components/ApiHealthStatus";
import { getApiBaseUrl, getMapboxTokenStatus } from "@/lib/runtime-config";

const sourceRows = [
  { agency: "USFS", dataset: "MVUM Roads", role: "Primary legal source" },
  { agency: "USFS", dataset: "MVUM Trails", role: "Primary legal source" },
  {
    agency: "BLM",
    dataset: "GTLF motorized roads/trails",
    role: "Primary legal source",
  },
  { agency: "OSM", dataset: "Supplemental geometry", role: "Discovery only" },
];

export default function Home() {
  const apiBaseUrl = getApiBaseUrl();
  const mapboxStatus = getMapboxTokenStatus();

  return (
    <main className="shell">
      <section className="masthead" aria-labelledby="page-title">
        <div className="masthead-copy">
          <p className="eyebrow">ECS trails</p>
          <h1 id="page-title">ECS Vehicle Trail System</h1>
          <p className="lede">{TRAIL_LEGAL_AUTHORITY_NOTICE}</p>
        </div>
        <div className="command-strip" aria-label="System readiness">
          <div>
            <span>API</span>
            <strong>{apiBaseUrl}</strong>
          </div>
          <div>
            <span>Mapbox token</span>
            <strong>{mapboxStatus}</strong>
          </div>
          <div>
            <span>Route graph</span>
            <strong>ECS verified only</strong>
          </div>
        </div>
      </section>

      <section className="workspace" aria-label="Trail system scaffold">
        <div className="panel map-readiness">
          <div>
            <p className="eyebrow">Access model</p>
            <h2>Routable Classes</h2>
          </div>
          <div className="access-list">
            {Object.entries(TRAIL_ACCESS_LABELS).map(
              ([classification, label]) => {
                const isRoutable = ROUTABLE_TRAIL_ACCESS.includes(
                  classification as (typeof ROUTABLE_TRAIL_ACCESS)[number],
                );

                return (
                  <div className="access-row" key={classification}>
                    <span
                      className={`access-dot ${isRoutable ? "dot-routable" : "dot-muted"}`}
                    />
                    <div>
                      <strong>{label}</strong>
                      <small>
                        {isRoutable
                          ? "Eligible after filters pass"
                          : "Not routable by default"}
                      </small>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>

        <ApiHealthStatus />

        <section
          className="panel source-panel"
          aria-labelledby="source-heading"
        >
          <div>
            <p className="eyebrow">Sources</p>
            <h2 id="source-heading">Initial Ingestion Targets</h2>
          </div>
          <div className="source-grid">
            {sourceRows.map((source) => (
              <div
                className="source-row"
                key={`${source.agency}-${source.dataset}`}
              >
                <span>{source.agency}</span>
                <strong>{source.dataset}</strong>
                <small>{source.role}</small>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
