import type { EstablishedCampsite } from './establishedCampsiteTypes';

export type EstablishedCampgroundDetailRow = {
  label: string;
  value: string | number;
};

function sourceLabel(value?: string | null): string {
  switch (String(value ?? '').toUpperCase()) {
    case 'RIDB':
    case 'RECREATION_GOV':
      return 'Recreation.gov';
    case 'NPS':
      return 'NPS';
    case 'CAMPFLARE':
      return 'Campflare';
    case 'ACTIVE':
      return 'ACTIVE';
    case 'RESERVEAMERICA':
      return 'ReserveAmerica';
    case 'ASPIRA':
      return 'Aspira';
    case 'OSM':
      return 'OSM';
    case 'STATE':
      return 'State';
    case 'COUNTY':
      return 'County';
    case 'PRIVATE':
      return 'Private';
    default:
      return 'Unknown';
  }
}

function boolLabel(value?: boolean): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function cleanDetailValue(value: string | number | null | undefined): string | number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (text.toLowerCase() === 'not supplied by source') return null;
  return text;
}

function row(label: string, value: string | number | null | undefined): EstablishedCampgroundDetailRow | null {
  const cleanValue = cleanDetailValue(value);
  return cleanValue == null ? null : { label, value: cleanValue };
}

function reservationCopy(campsite: EstablishedCampsite, reservationUrl?: string | null): string | null {
  if (reservationUrl) return 'Reservation / info link available';
  switch (campsite.reservationStatus) {
    case 'reservable':
      return 'Reservable source reported';
    case 'first_come':
      return 'First come / first served reported';
    case 'mixed':
      return 'Mixed reservable and first come reported';
    case 'required':
      return 'Reservation required';
    default:
      return null;
  }
}

function siteCountCopy(value?: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return `${Math.round(value)} sites`;
}

function stayTypeCopy(campsite: EstablishedCampsite): string | null {
  const values = [
    boolLabel(campsite.tentAllowed),
    boolLabel(campsite.rvAllowed),
    boolLabel(campsite.trailersAllowed),
  ];
  return values.every((value) => value === 'Unknown') ? null : values.join(' / ');
}

export function buildEstablishedCampgroundDetailRows(
  campsite: EstablishedCampsite,
): EstablishedCampgroundDetailRow[] {
  const reservationUrl = campsite.reservationUrl || campsite.bookingUrl;
  const sourceDate = formatDate(campsite.sourceUpdatedAt || campsite.lastSyncedAt || undefined);
  const availabilityDate = formatDate(campsite.lastAvailabilityCheckedAt || undefined);
  const verifiedDate = formatDate(campsite.lastVerifiedAt || undefined);

  return [
    row('Managing agency', campsite.managingAgency || campsite.operatorName || sourceLabel(campsite.source)),
    row('Managing org', campsite.managingOrg),
    row('Source / attribution', campsite.attribution || sourceLabel(campsite.primaryProvider || campsite.source)),
    row('Reservation', reservationCopy(campsite, reservationUrl)),
    row('Site count', siteCountCopy(campsite.siteCount)),
    row('Season / hours', campsite.seasonDescription || campsite.openingHours),
    row('Max vehicle length', campsite.maxVehicleLengthFt ? `${campsite.maxVehicleLengthFt} ft` : null),
    row('Tent / RV / trailers', stayTypeCopy(campsite)),
    row('Contact', campsite.phone),
    row('Last updated', sourceDate),
    row('Last checked', availabilityDate),
    row('Last verified', verifiedDate),
    row(
      'Source records',
      typeof campsite.sourceRecordCount === 'number' ? campsite.sourceRecordCount : null,
    ),
    row(
      'Availability rows',
      typeof campsite.availabilityRecordCount === 'number' ? campsite.availabilityRecordCount : null,
    ),
  ].filter((item): item is EstablishedCampgroundDetailRow => !!item);
}
