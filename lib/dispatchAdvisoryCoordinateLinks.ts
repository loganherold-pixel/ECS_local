export type DispatchAdvisoryCoordinate = {
  latitude: number;
  longitude: number;
};

export type DispatchAdvisoryCoordinateToken =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'coordinate';
      text: string;
      coordinate: DispatchAdvisoryCoordinate;
    };

const COORDINATE_PATTERN = /\b(?:GPS|Coordinates?|Location)?\s*:?\s*(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/gi;

function isValidAdvisoryCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function tokenizeDispatchAdvisoryCoordinateLinks(text: string): DispatchAdvisoryCoordinateToken[] {
  if (!text) return [];

  const tokens: DispatchAdvisoryCoordinateToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(COORDINATE_PATTERN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const coordinateStartOffset = raw.indexOf(match[1]);
    const coordinateIndex = coordinateStartOffset >= 0 ? index + coordinateStartOffset : index;
    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);

    if (!raw || coordinateIndex < cursor || !isValidAdvisoryCoordinate(latitude, longitude)) {
      continue;
    }

    if (coordinateIndex > cursor) {
      tokens.push({ type: 'text', text: text.slice(cursor, coordinateIndex) });
    }

    tokens.push({
      type: 'coordinate',
      text: text.slice(coordinateIndex, index + raw.length),
      coordinate: { latitude, longitude },
    });
    cursor = index + raw.length;
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', text: text.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', text }];
}
