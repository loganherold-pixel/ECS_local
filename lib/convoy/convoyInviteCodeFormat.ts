const CONVOY_INVITE_PREFIX = 'ECS';
const CONVOY_INVITE_BODY_LENGTH = 8;

export function stripConvoyInviteCode(value: string): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function formatConvoyInviteCode(value: string): string {
  const stripped = stripConvoyInviteCode(value);
  if (!stripped) return '';
  const bodySource = stripped.startsWith(CONVOY_INVITE_PREFIX)
    ? stripped.slice(CONVOY_INVITE_PREFIX.length)
    : stripped;
  const body = bodySource.slice(0, CONVOY_INVITE_BODY_LENGTH);
  const first = body.slice(0, 4);
  const second = body.slice(4, 8);

  return [CONVOY_INVITE_PREFIX, first, second].filter(Boolean).join('-');
}

export function normalizeConvoyInviteCodeForSubmit(value: string): string {
  return formatConvoyInviteCode(value);
}
