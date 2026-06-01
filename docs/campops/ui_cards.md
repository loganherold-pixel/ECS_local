# CampOps UI Cards

CampOps recommendation cards are shown in the campsite candidate panel only when the existing CampOps integration payload is enabled through `campopsRecommendationsEnabled`.

## Behavior

- The existing campsite result list remains visible for backward compatibility, but its copy is separated from CampOps recommendations when CampOps cards are visible.
- CampOps cards render above the existing candidate list.
- The first UI pass shows three operational roles: Recommended Camp, Backup Camp, and Emergency Camp.
- Cards use the deterministic `CampRecommendationSet` as the source of truth. The UI does not compute legal status, access status, resource margins, or safety conclusions.
- CampOps cards are operational recommendations. The legacy list is labeled `Search results` and represents available camps/results from the old search/ranking path.
- When CampOps is enabled, the legacy top result is labeled `Top result` rather than `Best` so it does not override the endpoint recommendation.
- If the top legacy result differs from the CampOps recommendation, is rejected by CampOps, or conflicts with a planned-camp downgrade, the UI shows a coexistence note directing the user to the endpoint recommendation cards.
- Where CampOps data exists, legacy result cards can be annotated with `Endpoint recommendation`, `Backup endpoint`, `Emergency fallback`, `CampOps caution`, or `Not recommended`.
- Missing fields are shown as `Unknown` or `Unknown confidence` where the card needs a stable field value.
- Action buttons are shown only when the host screen provides existing navigation or share handlers.
- Each card shows compact source transparency and a `Why this recommendation?` expandable section for reasoning details.

## Displayed Fields

Cards display available operational fields from candidate enrichment and suitability scores:

- camp name
- operational role
- recommendation status
- overall suitability score
- legal confidence
- ETA
- sunset margin
- fuel and water impact/margin
- late-arrival risk
- trailer suitability
- group fit
- data confidence
- top reasons
- top warnings

## Source Transparency

The compact card surface should show the most important source confidence fields without crowding the legacy camp list:

- `Legal confidence`
- `Closure status`
- `Fire restrictions`
- `Weather freshness`
- `Service/resupply`
- `Missing critical data`

If source data is stale, expired, conflicted, or missing, the card should use plain conservative language such as `Source data is stale`, `Closure status unknown`, `Fire restrictions unknown`, `Source conflict`, or `Recommendation based on limited data`.

## Why This Recommendation?

The expandable `Why this recommendation?` section provides the next level of detail for field review:

- top positive factors, limited to the highest-signal reasons
- top warnings and hard-gate or caution reasons
- resource debt details for fuel, water, daylight, and camp uncertainty where available
- late-arrival and decision point details where available
- source summaries, stale source notes, conflicts, and missing source notes
- planned camp downgrade reason, if applicable
- assumptions used by the deterministic engine

Keep the collapsed card concise: show the top three reasons and top three warnings, then place source summaries and longer explanations inside the expandable section.

## Language Rules

Use conservative recommendation language:

- `Recommended`
- `Backup`
- `Emergency stop`
- `Fallback only`
- `Not recommended`
- `Unknown confidence`

Do not use overconfident legal or safety wording such as `guaranteed open`, `definitely legal`, or similar claims. Prefer endpoint language such as `Recommended endpoint`, `Backup endpoint`, `Emergency fallback`, `Fallback only`, or `Unknown confidence`.

## Legacy Coexistence

Until the legacy candidate list is fully migrated, the UI must avoid presenting two competing decisions:

- CampOps cards own endpoint recommendation language.
- Legacy cards own search-result/display-ranking language.
- The legacy list must not call its top result `best` while CampOps cards are visible.
- A rejected CampOps candidate may remain in the legacy result list for compatibility, but it must be annotated as `Not recommended`.
- A caution candidate may remain visible, but it should be annotated as `CampOps caution`.
- A downgraded planned camp should not be described as the endpoint recommendation by legacy copy.
- Legacy filters must not hide CampOps backup or emergency endpoints from the CampOps cards. If an endpoint is not in the legacy visible list, the CampOps card remains the source of truth for that role.

Feature flag behavior remains unchanged: when `campopsRecommendationsEnabled` is false or no CampOps payload is present, the legacy list keeps its existing labels and ordering.
