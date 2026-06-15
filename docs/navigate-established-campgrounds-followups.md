# Navigate Established Campgrounds Follow-Ups

## Prosser-Style Campground Data Enrichment

Problem:
- Some real established campgrounds can score too low when provider records include a low source-confidence value but omit useful operator details.
- Example field report: Prosser Family Campground is known by the operator/user to support tent/RV/trailer camping, have seasonal operation, contain multiple sites, and require reservation, but ECS may only receive sparse cached fields.

Current mitigation:
- ECS scoring now treats official campground providers such as Recreation.gov/RIDB and NPS as a conservative baseline floor instead of letting a low source-confidence number hard-cap the campground score.
- Missing fields are no longer shown as "Not supplied by source" in the campground popup.

Follow-up for final touch-ups:
- Enrich established campground detail ingestion with provider-backed reservation/info URLs, site count, season/hours, max vehicle length, and stay-type details where available.
- Verify Prosser Family Campground against the canonical provider detail endpoint and confirm the popup shows only source-backed facts.
- Do not hardcode Prosser-specific facts in mobile UI; use provider/source-backed enrichment or an explicit operator/manual verification model.
