import type { MissionCommand } from './dispatchMissionCommandTypes';
import { sanitizeSourceTruthDisplayText } from './sourceTruth';

export interface MissionCommandResolutionTimelineCommand extends Pick<
  MissionCommand,
  'id' | 'expeditionId' | 'type' | 'operationalState' | 'resolution'
> {
  title?: string;
}

export interface MissionCommandResolutionTimelineEvent {
  id: string;
  sessionId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  occurredAt: string;
}

export interface MissionCommandResolutionTimelineWriter {
  getCurrentExpedition(): { id: string } | null;
  getTimeline(sessionId?: string): MissionCommandResolutionTimelineEvent[];
  logTimelineEvent(
    eventType: 'manual_note',
    eventData: Record<string, unknown>,
  ): MissionCommandResolutionTimelineEvent | null;
}

export type MissionCommandResolutionHandoffResult =
  | { status: 'appended'; event: MissionCommandResolutionTimelineEvent }
  | { status: 'duplicate'; event: MissionCommandResolutionTimelineEvent }
  | { status: 'not_resolved' | 'expedition_unavailable' | 'expedition_mismatch' | 'invalid'; reason: string };

export function appendMissionCommandResolutionToExpedition(
  command: MissionCommandResolutionTimelineCommand,
  writer: MissionCommandResolutionTimelineWriter,
): MissionCommandResolutionHandoffResult {
  if (!command || typeof command.id !== 'string' || typeof command.expeditionId !== 'string') {
    return { status: 'invalid', reason: 'Mission Command resolution reference is invalid.' };
  }
  if (
    command.operationalState !== 'resolved' &&
    command.operationalState !== 'cancelled' &&
    command.operationalState !== 'expired'
  ) {
    return { status: 'not_resolved', reason: 'Only a terminal Mission Command can append an expedition timeline note.' };
  }
  if (!command.resolution) {
    return { status: 'invalid', reason: 'Terminal Mission Command resolution details are unavailable.' };
  }

  try {
    const current = writer.getCurrentExpedition();
    if (!current) {
      return { status: 'expedition_unavailable', reason: 'No active expedition is available for the timeline handoff.' };
    }
    if (current.id !== command.expeditionId) {
      return { status: 'expedition_mismatch', reason: 'Mission Command belongs to a different expedition.' };
    }

    const occurredAt = validIso(command.resolution.occurredAt);
    const resolutionSummary = sanitizeSourceTruthDisplayText(command.resolution.summary, 320);
    if (!occurredAt || !resolutionSummary) {
      return { status: 'invalid', reason: 'Mission Command resolution summary or timestamp is invalid.' };
    }
    const missionCommandEventKey = [
      'mission-command-resolution',
      command.id,
      command.resolution.kind,
      occurredAt,
    ].join(':');
    const existing = writer.getTimeline(current.id).find((event) => (
      event.eventType === 'manual_note' &&
      event.eventData?.missionCommandEventKey === missionCommandEventKey
    ));
    if (existing) return { status: 'duplicate', event: existing };

    const event = writer.logTimelineEvent('manual_note', {
      source: 'mission_command',
      missionCommandEventKey,
      missionCommandId: command.id,
      missionCommandType: command.type,
      resolutionKind: command.resolution.kind,
      resolutionSummary,
      occurredAt,
    });
    if (!event) return { status: 'invalid', reason: 'Expedition timeline writer rejected the safe resolution event.' };
    return { status: 'appended', event };
  } catch {
    return { status: 'invalid', reason: 'Expedition timeline handoff is temporarily unavailable.' };
  }
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
