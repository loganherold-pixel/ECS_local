# CampOps Provider Readiness - Region Label Template

Use this template for target-region provider readiness evidence. This document is a template only. Do not mark a category approved until real target-region evidence is reviewed and approval fields are complete.

Do not include precise private coordinates, private user IDs, vehicle identifiers, raw provider payloads, secrets, private debrief notes, raw AI prompts, or provider credentials.

## Region

- Region label: TODO region label only
- Release cohort label: TODO cohort label only
- Validation mode: fixture-backed | real-shadow | approved
- Production recommendation impact: none
- Provider output applied to recommendations: false
- Raw provider payloads excluded: yes

## Category Approval Matrix

| Category | Validation mode | Data freshness window | Coverage summary | Conflict rate | Stale/unknown rate | Unknown handling behavior | Recommendation influence allowed | Approval status | Approver | Approval date | Remaining issues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| legal/access | fixture-backed | TODO | TODO | TODO | TODO | Unknown legal/access remains unknown or caution. | no | not approved | TODO | TODO | TODO |
| closure/seasonal restriction | fixture-backed | TODO | TODO | TODO | TODO | Unknown closure remains unknown and lowers confidence. | no | not approved | TODO | TODO | TODO |
| fire restriction | fixture-backed | TODO | TODO | TODO | TODO | Unknown fire status remains unknown; closures still gate. | no | not approved | TODO | TODO | TODO |
| weather | fixture-backed | TODO | TODO | TODO | TODO | Unknown/stale weather lowers confidence and warns. | no | not approved | TODO | TODO | TODO |
| service/resupply | fixture-backed | TODO | TODO | TODO | TODO | Unknown service status does not promise availability. | no | not approved | TODO | TODO | TODO |

## Privacy Notes

- Region and route labels only.
- Raw provider payloads excluded: yes.
- Provider credentials excluded: yes.
- Private user IDs excluded: yes.
- Vehicle identifiers excluded: yes.
- Precise private coordinates excluded: yes.
- Raw AI prompts excluded: yes.
- Private debrief notes excluded: yes.

## Remaining Issues

1. TODO
2. TODO
3. TODO

## Approval Notes

Recommendation influence is allowed only for rows where:

- `Validation mode` is `approved`.
- `Recommendation influence allowed` is `yes`.
- `Approval status` is `approved`.
- `Approver` is not TODO/TBD.
- `Approval date` is not TODO/TBD.

Fixture-backed and real-shadow validation are not approval by themselves.
