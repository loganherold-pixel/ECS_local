# CampOps AI Assist

CampOps AI assist is a narrator over deterministic CampOps outputs. It must not choose camps independently.

## Source Of Truth

AI input should be built from:

- `CampSearchContext` summary
- `CampRecommendationSet`
- recommended, backup, and emergency camps
- rejected candidate reasons
- hard-gate warnings
- suitability scores
- Resource Debt
- resolved source confidence
- stale source summaries
- source conflict summaries
- missing critical source data
- decision point summary, when present
- assumptions
- missing data
- confidence summary
- planned camp downgrade reason, when present

Do not pass unrelated raw user profile, private notes, or broad app state into the CampOps AI prompt.

## AI Rules

- AI explains CampOps outputs; deterministic CampOps remains the decision engine.
- Do not invent legal status.
- Do not invent weather, closures, fuel, water, slope, occupancy, road, or safety-critical facts.
- Do not override hard-gate rejections.
- Do not resurrect a rejected candidate as recommended.
- Do not remove hard-gate warnings, stale-data warnings, source conflicts, or missing-source warnings from the final summary.
- Do not call unknown legal status allowed.
- Do not treat stale closure, fire, weather, legal, or service data as current.
- If legal confidence is medium, low, or unknown, say so clearly.
- If data is stale or missing, say so clearly.
- For field mode, be concise and conservative.
- For planning mode, explain tradeoffs more fully.
- Never say "definitely legal", "guaranteed open", or "safe" unless that exact certainty exists in the provided CampOps data.
- Prefer "recommended", "not recommended", "fallback only", and "unknown" language.
- Include a user action when timing, daylight, resource, or access uncertainty is time-sensitive.

## Structured Output

The current CampOps AI assist contract expects:

```json
{
  "headline": "string",
  "primaryRecommendation": {
    "campId": "string | null",
    "status": "recommended | caution | not_recommended | unknown",
    "summary": "string"
  },
  "why": ["string"],
  "tradeoffs": ["string"],
  "risks": ["string"],
  "requiredActions": ["string"],
  "backupPlan": "string | null",
  "emergencyPlan": "string | null",
  "confidenceNote": "string",
  "sourceConfidenceNote": "string",
  "staleDataWarnings": ["string"],
  "missingDataWarnings": ["string"],
  "conflictWarnings": ["string"],
  "decisionPointSummary": "string | null",
  "convoyMessage": "string | null"
}
```

The parser must sanitize AI output against CampOps truth. If AI marks a hard-gate-rejected camp as recommended, the parsed output must downgrade it to `not_recommended`.

Post-processing also restores deterministic warnings if the model omits them:

- hard-gate reasons remain visible in `risks`
- stale legal, closure, fire, weather, and service notes remain visible in `staleDataWarnings`
- missing source and missing critical data notes remain visible in `missingDataWarnings`
- source conflicts remain visible in `conflictWarnings`
- decision point data remains visible in `decisionPointSummary`
- unknown legal status cannot be rewritten as allowed
- overconfident wording is softened before the output is used

## Fallback

Existing broader camp/logistics AI behavior may remain as fallback when no CampOps recommendation payload exists. In that case, the assistant must state that CampOps recommendation data is missing and should avoid making a camp selection.

## Adversarial AI Surface

CampOps AI tests should include hostile model-style JSON, not only prompt assertions. The parser and post-processing layer is expected to protect these failure modes deterministically:

- A hard-gate-rejected camp described as `recommended` is downgraded to `not_recommended`.
- Unknown legal status cannot be rewritten as allowed.
- Medium, low, or unknown legal confidence cannot be overstated as high or legally clear.
- Stale closure, fire, weather, legal, or service data cannot be described as current.
- Source conflicts are restored to `conflictWarnings` when omitted.
- Hard-gate reasons and stale/missing source warnings are restored when omitted.
- Campfire prohibitions must remain prohibitions; they cannot be softened into generic advice.
- Unknown fire restriction status must remain visible as missing/unknown data.
- AI-invented fuel, water, service availability, operating hours, and trailer turnaround certainty are corrected to unknown/verify language.
- Emergency fallback camps cannot be narrated as comfortable primary recommendations unless CampOps selected them as primary.
- Overconfident phrases such as "definitely legal", "guaranteed open", "safe", "no risk", "always accessible", and "you can definitely camp here" are softened before UI or downstream use.

Field-mode evals should keep output concise and conservative. Planning-mode evals should preserve fuller tradeoff explanations while still enforcing the same safety, legal, source, and resource guardrails.

## Real-Output Review Harness

Use `scripts/campops-ai-real-output-review.js` for pre-field-test review of actual model outputs. The harness uses fixed CampOps fixture inputs, avoids private user/trip/vehicle data, avoids precise private locations, parses model output through the same CampOps guardrails, and writes only parsed status, dangerous phrase labels, and guardrail interventions to the report. It does not store raw model text by default.

Dry run with deterministic adversarial samples:

```bash
node scripts/campops-ai-real-output-review.js --dry-run --write-report --quiet
```

Real model review is opt-in only:

```bash
$env:CAMPOPS_AI_REAL_OUTPUT_REVIEW='1'
$env:CAMPOPS_AI_REVIEW_PROVIDER='openai_responses'
$env:CAMPOPS_AI_REVIEW_MODEL='<approved-test-model>'
$env:OPENAI_API_KEY='<dev/test key>'
node scripts/campops-ai-real-output-review.js --write-report
```

Do not run the real-output path with production user data. Do not enable `campopsAiAssistEnabled` for field testers until `docs/campops/ai_real_output_review.md` records a configured real-model run, `Real model executed in this report: yes`, no critical post-parser failures, an exact active model/config, a current-or-past approval date, and product/privacy approval for that same model/config path.
