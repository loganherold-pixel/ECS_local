import type {
  EstablishedCampsite,
  EstablishedCampsiteFeatureCollection,
} from './establishedCampsiteTypes';

export const ESTABLISHED_CAMPGROUND_PIN_DEDUPE_RADIUS_METERS = 200;

export type EstablishedCampsiteMapDedupeDiagnostics = {
  inputCount: number;
  validCount: number;
  clusterCount: number;
  duplicateCount: number;
  distanceCheckCount: number;
};

export type EstablishedCampsiteMapDedupeResult = {
  campsites: EstablishedCampsite[];
  diagnostics: EstablishedCampsiteMapDedupeDiagnostics;
};

function validCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function distanceMeters(
  a: Pick<EstablishedCampsite, 'latitude' | 'longitude'>,
  b: Pick<EstablishedCampsite, 'latitude' | 'longitude'>,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMeters = 6_371_000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function providerRank(provider?: string | null): number {
  switch (String(provider ?? '').trim().toLowerCase()) {
    case 'ridb':
    case 'recreation_gov':
      return 80;
    case 'nps':
      return 75;
    case 'campflare':
    case 'reserveamerica':
    case 'aspira':
    case 'active':
      return 70;
    case 'state':
    case 'county':
      return 60;
    case 'osm':
      return 45;
    default:
      return 40;
  }
}

function campsiteRank(campsite: EstablishedCampsite): number {
  const confidence = Number.isFinite(campsite.sourceConfidence ?? Number.NaN)
    ? Number(campsite.sourceConfidence)
    : 0;
  const siteCount = Number.isFinite(campsite.siteCount ?? Number.NaN)
    ? Number(campsite.siteCount)
    : 0;
  const provider = providerRank(campsite.primaryProvider ?? campsite.source);
  const hasBooking = campsite.bookingUrl || campsite.reservationUrl || campsite.detailUrl ? 1 : 0;
  return confidence * 10_000 + provider * 100 + Math.min(siteCount, 99) + hasBooking;
}

export function dedupeEstablishedCampsitesForMap(
  campsites: EstablishedCampsite[],
  radiusMeters = ESTABLISHED_CAMPGROUND_PIN_DEDUPE_RADIUS_METERS,
): EstablishedCampsite[] {
  return dedupeEstablishedCampsitesForMapWithDiagnostics(campsites, radiusMeters).campsites;
}

export function dedupeEstablishedCampsitesForMapWithDiagnostics(
  campsites: EstablishedCampsite[],
  radiusMeters = ESTABLISHED_CAMPGROUND_PIN_DEDUPE_RADIUS_METERS,
): EstablishedCampsiteMapDedupeResult {
  const validEntries = campsites
    .map((campsite, index) => ({ campsite, index }))
    .filter(({ campsite }) => validCoordinate(campsite.latitude, campsite.longitude));
  if (validEntries.length < 2 || radiusMeters <= 0) {
    return {
      campsites,
      diagnostics: {
        inputCount: campsites.length,
        validCount: validEntries.length,
        clusterCount: validEntries.length,
        duplicateCount: 0,
        distanceCheckCount: 0,
      },
    };
  }

  const parent = validEntries.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  const cellDegrees = Math.max(0.000001, radiusMeters / 111_320);
  const buckets = new Map<string, number[]>();
  let distanceCheckCount = 0;
  validEntries.forEach((entry, index) => {
    const latBucket = Math.floor(entry.campsite.latitude / cellDegrees);
    const lngBucket = Math.floor(entry.campsite.longitude / cellDegrees);
    const longitudeRange = Math.max(
      1,
      Math.ceil(1 / Math.max(0.1, Math.cos((entry.campsite.latitude * Math.PI) / 180))),
    );
    for (let latDelta = -1; latDelta <= 1; latDelta += 1) {
      for (let lngDelta = -longitudeRange; lngDelta <= longitudeRange; lngDelta += 1) {
        const nearby = buckets.get(`${latBucket + latDelta}:${lngBucket + lngDelta}`) ?? [];
        for (const nearbyIndex of nearby) {
          distanceCheckCount += 1;
          if (distanceMeters(entry.campsite, validEntries[nearbyIndex].campsite) <= radiusMeters) {
            union(index, nearbyIndex);
          }
        }
      }
    }
    const key = `${latBucket}:${lngBucket}`;
    buckets.set(key, [...(buckets.get(key) ?? []), index]);
  });

  const grouped = new Map<number, Array<{ campsite: EstablishedCampsite; index: number }>>();
  validEntries.forEach((entry, index) => {
    const root = find(index);
    grouped.set(root, [...(grouped.get(root) ?? []), entry]);
  });

  const groupedIndexes = new Set(validEntries.map((entry) => entry.index));
  const collapsed = Array.from(grouped.values())
    .sort((a, b) => Math.min(...a.map((entry) => entry.index)) - Math.min(...b.map((entry) => entry.index)))
    .map((group) => {
      if (group.length === 1) return group[0].campsite;
      const winner = [...group]
        .sort((a, b) => campsiteRank(b.campsite) - campsiteRank(a.campsite) || a.index - b.index)[0]
        .campsite;
      const latitude = group.reduce((sum, entry) => sum + entry.campsite.latitude, 0) / group.length;
      const longitude = group.reduce((sum, entry) => sum + entry.campsite.longitude, 0) / group.length;
      return {
        ...winner,
        latitude,
        longitude,
        nearbyCampgroundCount: group.length,
        nearbyCampgroundIds: group.map((entry) => entry.campsite.id),
        nearbyCampgroundNames: Array.from(new Set(group.map((entry) => entry.campsite.name).filter(Boolean))),
      };
    });

  const invalidEntries = campsites.filter((_, index) => !groupedIndexes.has(index));
  return {
    campsites: [...collapsed, ...invalidEntries],
    diagnostics: {
      inputCount: campsites.length,
      validCount: validEntries.length,
      clusterCount: grouped.size,
      duplicateCount: Math.max(0, validEntries.length - grouped.size),
      distanceCheckCount,
    },
  };
}

export function toEstablishedCampsiteFeatureCollection(
  campsites: EstablishedCampsite[],
): EstablishedCampsiteFeatureCollection {
  const visibleCampsites = dedupeEstablishedCampsitesForMap(campsites);
  return {
    type: 'FeatureCollection',
    features: visibleCampsites
      .filter((campsite) => validCoordinate(campsite.latitude, campsite.longitude))
      .map((campsite) => {
        const { latitude, longitude, ...properties } = campsite;
        return {
          type: 'Feature' as const,
          id: campsite.id,
          geometry: {
            type: 'Point' as const,
            coordinates: [longitude, latitude] as [number, number],
          },
          properties,
        };
      }),
  };
}
