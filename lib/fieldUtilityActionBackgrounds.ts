import type { ImageSourcePropType } from 'react-native';

export type FieldUtilityActionBackgroundKey =
  | 'note'
  | 'comms'
  | 'recovery-protocol'
  | 'permits-access'
  | 'trip-summaries'
  | 'protocols';

const FIELD_UTILITY_ACTION_BACKGROUND_ASSETS: Record<FieldUtilityActionBackgroundKey, ImageSourcePropType> = {
  note: require('../assets/field-utilities/quick-note.png'),
  comms: require('../assets/field-utilities/comms.png'),
  'recovery-protocol': require('../assets/field-utilities/recovery-protocol.png'),
  'permits-access': require('../assets/field-utilities/permits-access.png'),
  'trip-summaries': require('../assets/field-utilities/trip-summaries.png'),
  protocols: require('../assets/field-utilities/emergency-protocol.png'),
};

export const FIELD_UTILITY_ACTION_BACKGROUNDS: Record<string, ImageSourcePropType> =
  FIELD_UTILITY_ACTION_BACKGROUND_ASSETS;
