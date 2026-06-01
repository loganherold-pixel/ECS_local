import {
  expeditionTripRecordStore,
  normalizeExpeditionTripRecord,
} from './expeditionTripRecordStore';
import type {
  ExpeditionTripRecord,
  ExpeditionTripSummary,
} from './expeditionTripRecordTypes';

function validTripId(tripId: string): string | null {
  const normalized = tripId.trim();
  return normalized.length > 0 ? normalized : null;
}

function toCompletedTripSummary(record: ExpeditionTripRecord): ExpeditionTripSummary {
  return {
    id: record.id,
    title: record.title,
    completedAt: record.completedAt,
    totalDistanceMiles: record.totalDistanceMiles,
    totalDurationSeconds: record.totalDurationSeconds,
    maxElevationFt: record.maxElevationFt,
    badgesUnlockedCount: record.badgesUnlocked.length,
    notableMomentsCount: record.notableMoments.length,
    startCoordinate: record.startCoordinate,
    endCoordinate: record.endCoordinate,
    routeBounds: record.routeBounds,
  };
}

function completedAtMs(summary: ExpeditionTripSummary): number {
  const parsed = new Date(summary.completedAt ?? '').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getCompletedTrips(): Promise<ExpeditionTripSummary[]> {
  const summaries = await expeditionTripRecordStore.getCompletedSummaries();
  return summaries
    .filter((summary) => !!summary.id)
    .sort((a, b) => completedAtMs(b) - completedAtMs(a));
}

export async function getTripById(tripId: string): Promise<ExpeditionTripRecord | null> {
  const id = validTripId(tripId);
  if (!id) return null;
  const record = await expeditionTripRecordStore.getById(id);
  return normalizeExpeditionTripRecord(record);
}

export async function getMostRecentCompletedTrip(): Promise<ExpeditionTripSummary | null> {
  const [mostRecent] = await getCompletedTrips();
  return mostRecent ?? null;
}

export async function getActiveTrip(): Promise<ExpeditionTripRecord | null> {
  const record = await expeditionTripRecordStore.getActive();
  return normalizeExpeditionTripRecord(record);
}

export async function archiveTrip(tripId: string): Promise<ExpeditionTripRecord | null> {
  const id = validTripId(tripId);
  if (!id) return null;
  return expeditionTripRecordStore.archive(id);
}

export async function deleteTripRecord(tripId: string): Promise<boolean> {
  const id = validTripId(tripId);
  if (!id) return false;
  return expeditionTripRecordStore.delete(id);
}

export async function updateTripTitle(
  tripId: string,
  title: string,
): Promise<ExpeditionTripRecord | null> {
  const id = validTripId(tripId);
  if (!id) return null;
  return expeditionTripRecordStore.updateTitle(id, title);
}

export const expeditionTripRepository = {
  getCompletedTrips,
  getTripById,
  getMostRecentCompletedTrip,
  getActiveTrip,
  archiveTrip,
  deleteTripRecord,
  updateTripTitle,
};

export function summarizeCompletedTripForList(record: ExpeditionTripRecord): ExpeditionTripSummary {
  return toCompletedTripSummary(record);
}
