export const LEGAL_OWNER_NAME = 'Expedition Command'; // TODO: confirm exact legal owner name.
export const COPYRIGHT_YEAR = '2026';
export const APP_VERSION = '1.0.0';

export const APP_LEGAL_NAME = 'Expedition Command System™ (ECS™)';

export const COPYRIGHT_NOTICE =
  `Copyright © ${COPYRIGHT_YEAR} ${LEGAL_OWNER_NAME}. All rights reserved.`;

export const TRADEMARK_NOTICE =
  `ECS™, Expedition Command™, and Expedition Command System™ are trademarks of ${LEGAL_OWNER_NAME}.`;

export const THIRD_PARTY_MARKS_NOTICE =
  'All other trademarks, service marks, product names, and company names are the property of their respective owners.';

export const ADVISORY_NOTICE =
  'ECS guidance is advisory and should be verified against current field conditions, official sources, and user judgment.';

export const SHORT_LEGAL_FOOTER =
  `© ${COPYRIGHT_YEAR} ${LEGAL_OWNER_NAME}. ECS™ / Expedition Command™.`;

export const COMPACT_LEGAL_LINES = [
  TRADEMARK_NOTICE,
  COPYRIGHT_NOTICE,
] as const;
