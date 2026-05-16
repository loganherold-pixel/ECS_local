# CampOps Convoy Awareness

CampOps recommendations should represent the convoy's limiting vehicle and resource state where that data is available. The deterministic engine remains the source of truth; AI may only summarize the resulting recommendation, scores, warnings, and assumptions.

## Context Fields

`CampOpsConvoyProfile` supports convoy-level planning inputs:

- vehicle count
- people count
- pets count
- kids present or kid count
- trailer count or trailer present
- least capable vehicle profile
- lowest fuel reserve vehicle
- lowest water reserve vehicle
- mechanical issue flag
- consented medical or accessibility constraint flag
- preferred convoy risk tolerance

Single-vehicle flows can omit these fields. Missing convoy data should reduce confidence or stay unknown; it should not imply extra margin.

## Recommendation Behavior

- Fuel and water resource debt use the lowest convoy reserve when it is lower than the candidate margin.
- Resource scoring uses attached Resource Debt, so a low-fuel or low-water vehicle can downgrade otherwise attractive camps.
- Trailer presence can come from the primary vehicle, convoy trailer fields, least capable vehicle profile, or camp preferences.
- Large groups increase the weight of group fit and make low-confidence capacity data more costly.
- Mechanical issue flags increase the importance of recovery-friendly access where exit, road, service, or recovery data exists.

## Explanation Language

When limiting convoy resource data is used, recommendation assumptions and tradeoffs should include:

`Recommendation is based on the convoy’s limiting vehicle/resource.`

Do not describe a camp as guaranteed, definitely legal, or safe unless that certainty exists in deterministic inputs.
