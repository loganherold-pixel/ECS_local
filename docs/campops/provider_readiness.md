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
5. Enable provider influence only after the relevant categories are `ready` or intentionally accepted as `watch` for an internal cohort.
6. Keep source transparency visible during limited rollout.

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
