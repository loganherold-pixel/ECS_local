# ECS Campsite Review Policy

## Purpose

The campsite review wall protects users, land access, local communities, wildlife, cultural resources, and ECS trust. Reviewers are not certifying that a location is safe or legal. They are deciding whether a campsite submission has enough responsible evidence to move forward.

## What Reviewers Should Approve

Approve only when the submission appears to be:

- an established or durable campsite;
- specific enough to locate without exposing sensitive details;
- plausibly legal and open based on available evidence;
- not private, closed, fragile, wildlife-sensitive, culturally sensitive, or overcrowded;
- supported by useful notes, visit context, or in-person verification;
- not a duplicate of an existing ECS campsite;
- appropriate for the listed access difficulty and vehicle fit.

Approval should be conservative when evidence is stale, sparse, or planning-derived.

## What Reviewers Should Reject

Reject or escalate when the submission:

- points to private land or unclear access;
- is in a closed/no-camping area;
- appears culturally sensitive, wildlife-sensitive, fragile, or environmentally risky;
- uses bad coordinates, null island, or vague location data;
- looks like a duplicate without a clear merge target;
- describes unsafe conditions that should not be promoted;
- lacks required stewardship acknowledgements;
- includes notes that are spammy, abusive, promotional, or not campsite-specific.

## Sensitive Location Policy

Sensitive locations should not be published publicly. This includes but is not limited to culturally sensitive places, fragile desert crust, riparian buffers, nesting or habitat areas, archaeological resources, and places where publication could increase damage or crowding.

Reviewer behavior:

- Use `sensitive` for likely sensitive locations.
- Use high confidence only when the evidence is specific.
- Do not expose exact sensitive-layer details in reviewer notes visible outside authorized moderator views.
- Prefer moderator escalation when uncertain.

## CampOps Debrief Publishing

CampOps debriefs are private by default. Community-visible debrief publishing requires explicit consent and a public-safe redaction step.

Reviewer and pipeline behavior:

- Do not publish raw CampOps debrief records.
- Use anonymized/public-safe debrief fields only: observed access, observed capacity, trailer suitability, fire signage, hazards, coarse date bucket, and confidence.
- Do not expose private user ids, vehicle ids, raw photo refs, precise coordinates, or exact timestamps from debriefs.
- Generalized location may be used only when the product flow intentionally allows it; otherwise prefer camp id or moderator-only location context.
- Freeform notes should be treated as moderation input, not public copy, unless a future privacy-reviewed flow explicitly supports redacted note publishing.

## Private Land Policy

Private land submissions should not be published unless there is clear, durable public permission or an established legal camping right.

Reviewer behavior:

- Use `private_land` when the submission likely falls on private property or access depends on a private road.
- Request more information if the submitter may have permission but did not document it.
- Reject or escalate if permission cannot be verified.

## Duplicate Handling

Duplicates are not discarded silently.

Reviewer behavior:

- Use `duplicate` when the submission appears to describe an existing campsite or pending report.
- Prefer merge when the new report improves details, recency, access notes, vehicle fit, or confirmation.
- Reject only when the duplicate adds no useful information or is low quality.

## Closed or No-Camping Handling

Closed and no-camping reports must be handled conservatively.

Reviewer behavior:

- Use `closed_to_camping` when the location appears to be closed, posted, seasonally restricted, permit-only without evidence, or otherwise not available for camping.
- Escalate if closure evidence conflicts with older reports.
- Do not publish sites with unresolved closure evidence.

## Needs-Info Examples

Use `needs_info` when a submission may be valid but lacks enough detail.

Examples:

- `Visited date is missing for an in-person claim.`
- `Please clarify whether this is an established campsite or a planning waypoint.`
- `Please confirm the site is not on private or closed land.`
- `Coordinates appear offset from the described campsite.`
- `Vehicle fit or access difficulty conflicts with the notes.`
- `Photo or GPX source suggests a route point, not a campsite.`

Needs-info requests should be specific, brief, and actionable.

## Reviewer Abuse and Suspension Policy

Trusted reviewer status is a responsibility, not a permanent entitlement.

Abuse signals include:

- repeated approve-only voting without notes;
- voting on own submissions;
- coordinated voting from newly trusted accounts;
- repeated votes that conflict with final moderator decisions without safety rationale;
- using notes to expose sensitive details unnecessarily;
- harassment, spam, or promotional behavior;
- ignoring private land, closures, or sensitive-area warnings.

Moderators may:

- suspend a reviewer;
- promote a candidate to trusted reviewer;
- review vote history;
- preserve minority safety votes for audit;
- reduce reputation for repeated low-quality decisions.

Minority safety votes should not be penalized aggressively. A good-faith `sensitive`, `private_land`, or `closed_to_camping` vote can be useful even if later resolved differently by a moderator.
