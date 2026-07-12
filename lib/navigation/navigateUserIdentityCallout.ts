export type NavigateUserIdentityCalloutModel = {
  displayName: string;
  trophyRank: string;
  contextLabel: string;
};

export type NavigateUserIdentityCalloutInput = {
  activeConvoyContext?: {
    callsign?: unknown;
    expeditionBadgeTitle?: unknown;
    role?: unknown;
  } | null;
  currentConvoyMember?: {
    displayName?: unknown;
    callsign?: unknown;
    expeditionBadgeTitle?: unknown;
    role?: unknown;
  } | null;
  dispatchProfile?: {
    displayName?: unknown;
    callsign?: unknown;
  } | null;
  operatorDisplayName?: unknown;
  user?: {
    email?: unknown;
    user_metadata?: Record<string, unknown> | null;
  } | null;
  localExpeditionIdentityTitle?: unknown;
};

const DEFAULT_DISPLAY_NAME = 'ECS Operator';
const DEFAULT_TROPHY_RANK = 'Trail Scout';

function cleanLabel(value: unknown, maxLength = 60): string | null {
  if (typeof value !== 'string') return null;
  const label = value.replace(/\s+/g, ' ').trim();
  return label ? label.slice(0, maxLength) : null;
}

function displayNameFromEmail(value: unknown): string | null {
  const email = cleanLabel(value, 120);
  if (!email) return null;
  const localPart = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!localPart) return null;
  return localPart.replace(/\b\w/g, (character) => character.toUpperCase()).slice(0, 60);
}

function roleLabel(value: unknown): string {
  const role = cleanLabel(value, 24);
  return role ? role.toUpperCase() : 'MEMBER';
}

export function buildNavigateUserIdentityCallout(
  input: NavigateUserIdentityCalloutInput,
): NavigateUserIdentityCalloutModel | null {
  if (!input.activeConvoyContext) return null;

  const metadata = input.user?.user_metadata ?? {};
  const displayName =
    cleanLabel(input.currentConvoyMember?.displayName) ??
    cleanLabel(input.dispatchProfile?.displayName) ??
    cleanLabel(input.operatorDisplayName) ??
    cleanLabel(metadata.display_name) ??
    cleanLabel(metadata.full_name) ??
    cleanLabel(metadata.name) ??
    cleanLabel(input.currentConvoyMember?.callsign) ??
    cleanLabel(input.dispatchProfile?.callsign) ??
    cleanLabel(input.activeConvoyContext.callsign) ??
    displayNameFromEmail(input.user?.email) ??
    DEFAULT_DISPLAY_NAME;
  const trophyRank =
    cleanLabel(input.localExpeditionIdentityTitle, 48) ??
    cleanLabel(input.currentConvoyMember?.expeditionBadgeTitle, 48) ??
    cleanLabel(input.activeConvoyContext.expeditionBadgeTitle, 48) ??
    DEFAULT_TROPHY_RANK;
  const activeRole = input.currentConvoyMember?.role ?? input.activeConvoyContext.role;

  return {
    displayName,
    trophyRank,
    contextLabel: `ACTIVE CONVOY / ${roleLabel(activeRole)}`,
  };
}
