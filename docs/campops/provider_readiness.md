# CampOps Provider Readiness Reports

CampOps provider readiness reports are developer-facing diagnostics for deciding whether a provider set is ready for a region, release cohort, or limited rollout.

They are generated from `runCampOpsProviderValidation` output with `createCampOpsProviderReadinessReport`. The report can be rendered as JSON with `renderCampOpsProviderReadinessJson` or Markdown with `renderCampOpsProviderReadinessMarkdown`.

## Privacy Contract

Readiness reports must not include:

- precise coordinates
- raw user ids
- vehicle ids
- private debrief notes
- raw AI prompts
- secrets, API keys, or provider credentials

Use region labels, release cohort labels, or fixture names instead of exact locations. The renderer sanitizes obvious coordinate-like values, but provider callers should avoid passing sensitive labels in the first place.

## Report Fields

Each category row includes:

- provider category
- provider status: `configured`, `missing`, or `disabled`
- coverage band
- freshness band
- stale source count
- conflict count
- unknown signal count
- missing data count
- source confidence distribution
- user-facing recommendation impact

Top-level report fields include overall coverage, freshness, conflict frequency, unknown rate, stale rate, missing-data rate, readiness decision, warnings, and provider-level diagnostic summaries.

## Access Category Policy

CampOps currently treats `legal/access` as one combined provider category unless a region explicitly configures a standalone `access` source provider. A combined category can represent legal status and public-access fields, but it must not be reported as independent access readiness.

If standalone access is not configured:

- document that access remains combined under `legal/access`
- keep unknown, stale, missing, or conflicting access signals visible
- do not imply physical access, route suitability, or permission from legal status alone
- do not approve access influence separately from legal/access

## Real Upstream Evidence Requirement

Fixture-backed provider validation proves only the harness, normalized shape, stale/missing/conflict handling, and report rendering. It is not provider readiness for field influence.

Before `campopsProviderAdaptersEnabled` may affect recommendations for a region/category, the readiness packet must record real upstream shadow output for that exact region/category, including:

- provider/source identity or reviewed source group
- candidate count and covered-candidate count
- coverage rate or coverage band
- freshness rate or freshness band
- unknown rate
- stale rate
- conflict rate
- user-facing source transparency behavior
- approver and approval date for recommendation influence

Real-shadow validation remains observational until the approval fields are complete. Do not mark legal/access, closure, fire, weather, or service/resupply ready for broader regional rollout from fixture-only evidence.

## Readiness Bands

Coverage bands:

- `high`: most candidates have normalized source coverage
- `medium`: useful partial coverage, but rollout should be limited
- `low`: provider coverage is too sparse for production influence
- `none`: no candidate coverage
- `unknown`: validation did not have enough context

Freshness bands:

- `fresh`: provider data is current enough for the provider stale policy
- `mixed`: some source data is fresh while some is stale, expired, or unknown
- `stale`: all or most observed source data is stale
- `expired`: observed source data is expired
- `unknown`: provider freshness cannot be established

Readiness decisions:

- `ready`: high coverage, fresh data, no meaningful conflicts, and low missing/unknown rates
- `watch`: useful but needs limited rollout, source transparency, or closer review
- `not_ready`: missing categories, low coverage, stale/expired data, high conflict rate, or high missing-data rate
- `disabled`: validation did not run

## Rollout Use

Suggested flow:

1. Run provider validation in shadow mode for the target region or cohort.
2. Generate a readiness report.
3. Review legal/access, closure, fire, weather, and service rows separately.
4. Keep `campopsProviderAdaptersEnabled` off for categories marked `not_ready`.
5. Enable provider influence only after the relevant categories have real upstream evidence and are `ready` or intentionally accepted as `watch` for an internal cohort.
6. Keep source transparency visible during limited rollout.
7. Keep provider adapters disabled outside the exact approved region/category/route scope until real provider evidence is accepted for additional regions.

## Example

```ts
const validation = await runCampOpsProviderValidation({
  mode: 'shadow',
  regionLabel: 'Northern Nevada internal test cell',
  context,
  candidates,
  providers,
  rolloutConfig: {
    campopsProviderValidationShadowModeEnabled: true,
  },
});

const report = createCampOpsProviderReadinessReport(validation, {
  generatedAtIso: new Date().toISOString(),
  releaseCohortLabel: 'internal-fixtures',
});

console.log(renderCampOpsProviderReadinessMarkdown(report));
```

Tests use fixture cohorts for high-readiness, low-coverage, stale-source, and conflicting-source provider sets. They do not make live network calls.
