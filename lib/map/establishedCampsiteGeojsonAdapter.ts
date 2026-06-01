import type {
  EstablishedCampsite,
  EstablishedCampsiteFeatureCollection,
} from './establishedCampsiteTypes';

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

export function toEstablishedCampsiteFeatureCollection(
  campsites: EstablishedCampsite[],
): EstablishedCampsiteFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: campsites
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
