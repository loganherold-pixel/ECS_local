import React from 'react';
import {
  Image,
  type ImageStyle,
  type StyleProp,
} from 'react-native';

import { getExpeditionBadgeArtwork } from '../../assets/expedition-badges';

type ExpeditionBadgeArtworkProps = {
  badgeId: string;
  title: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
};

/** Achieved-state artwork. Locked badge surfaces must keep their iconKey treatment. */
export function ExpeditionBadgeArtwork({
  badgeId,
  title,
  size = 120,
  style,
}: ExpeditionBadgeArtworkProps): React.JSX.Element | null {
  const source = getExpeditionBadgeArtwork(badgeId);
  if (!source) return null;

  return (
    <Image
      source={source}
      resizeMode="contain"
      style={[{ width: size, height: size }, style]}
      accessibilityRole="image"
      accessibilityLabel={`${title}, achieved badge`}
    />
  );
}
