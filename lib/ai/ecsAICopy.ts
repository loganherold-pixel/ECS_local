const COPY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bAI-Inferred\b/gi, 'ECS-Inferred'],
  [/\bAI alert\b/gi, 'ECS Advisory'],
  [/\bAI warning\b/gi, 'ECS Advisory'],
  [/\bAI says\b/gi, 'ECS recommends'],
  [/\bAI Advisory\b/gi, 'ECS Advisory'],
  [/\bAI Alert\b/gi, 'ECS Advisory'],
  [/\bAI Warning\b/gi, 'ECS Advisory'],
  [/\bThis campsite is legal\b/gi, 'No known closure or access conflict found from available sources'],
  [/\b(?:this\s+)?(?:camp(?:site)?|location|route|trail)\s+is\s+legal\b/gi, 'No known access conflict was found from available data'],
  [/\b(?:this\s+)?(?:camp(?:site)?|location|route|trail)\s+is\s+safe\b/gi, 'This requires field verification'],
  [/\b(?:this\s+)?(?:camp(?:site)?|location|route|trail)\s+is\s+approved\b/gi, 'This has a reviewed source status'],
  [/\blegal campsite\b/gi, 'camp candidate with no known access conflict'],
  [/\bsafe campsite\b/gi, 'camp candidate requiring field verification'],
  [/\bapproved campsite\b/gi, 'reviewed campsite record'],
  [/\bguaranteed\s+(?:safe|open|accessible|passable|legal)\b/gi, 'requires confirmation'],
  [/\bguaranteed\b/gi, 'requires confirmation'],
  [/\bverified\b/gi, 'source-backed'],
  [/\bno risk\b/gi, 'no known elevated risk from available data'],
  [/\bbest\b/gi, 'preferred'],
  [/\bclear\b/gi, 'no known conflict found'],
];

export function sanitizeECSAICopy(value: string | null | undefined): string {
  let next = String(value ?? '').replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of COPY_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

export function formatECSAITruthLabel(truths: string[]): string {
  const labels = truths
    .map((truth) => {
      switch (truth) {
        case 'live':
          return 'Live';
        case 'cached':
          return 'Cached';
        case 'estimated':
          return 'Estimated';
        case 'manual':
          return 'Manual';
        case 'simulated':
          return 'Simulation';
        case 'unavailable':
        default:
          return 'Unavailable';
      }
    })
    .filter(Boolean);
  return Array.from(new Set(labels)).join(' / ') || 'Unavailable';
}

export function conciseECSAIMessage(value: string, max = 148): string {
  const safe = sanitizeECSAICopy(value);
  if (safe.length <= max) return safe;
  return `${safe.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}
