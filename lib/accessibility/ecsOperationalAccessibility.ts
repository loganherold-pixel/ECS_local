export type ECSOperationalAnnouncementKind =
  | 'error'
  | 'connection_changed'
  | 'route_activated'
  | 'stale_data'
  | 'critical_advisory'
  | 'offline_action_queued';

export type ECSOperationalAnnouncementEvent = {
  id: string;
  kind: ECSOperationalAnnouncementKind;
  subject: string;
  detail?: string | null;
  count?: number | null;
};

export type ECSOperationalAnnouncement = {
  message: string;
  priority: 'polite' | 'assertive';
  liveRegion: 'polite' | 'assertive';
  fingerprint: string;
};

function normalizeAnnouncementPart(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function joinAnnouncement(primary: string, detail?: string | null) {
  const normalizedDetail = normalizeAnnouncementPart(detail);
  return normalizedDetail ? `${primary} ${normalizedDetail}` : primary;
}

/**
 * Converts already-validated operational state into screen-reader copy. This
 * module does not infer route, safety, connection, or delivery conclusions.
 */
export function buildECSOperationalAnnouncement(
  event: ECSOperationalAnnouncementEvent,
): ECSOperationalAnnouncement {
  const subject = normalizeAnnouncementPart(event.subject) || 'ECS operation';
  const id = normalizeAnnouncementPart(event.id) || `${event.kind}:${subject}`;
  const count = Number.isFinite(event.count) ? Math.max(0, Math.trunc(event.count ?? 0)) : null;

  let message: string;
  let priority: ECSOperationalAnnouncement['priority'] = 'polite';

  switch (event.kind) {
    case 'error':
      message = joinAnnouncement(`${subject} error.`, event.detail);
      priority = 'assertive';
      break;
    case 'connection_changed':
      message = joinAnnouncement(`${subject} connection changed.`, event.detail);
      break;
    case 'route_activated':
      message = joinAnnouncement(`Route activated: ${subject}.`, event.detail);
      break;
    case 'stale_data':
      message = joinAnnouncement(`${subject} data is stale.`, event.detail);
      break;
    case 'critical_advisory':
      message = joinAnnouncement(`Critical advisory: ${subject}.`, event.detail);
      priority = 'assertive';
      break;
    case 'offline_action_queued': {
      const queueCopy = count === null
        ? `${subject} queued for offline delivery.`
        : `${count} ${subject}${count === 1 ? '' : 's'} queued for offline delivery.`;
      message = joinAnnouncement(queueCopy, event.detail);
      break;
    }
    default: {
      const exhaustive: never = event.kind;
      throw new Error(`Unsupported ECS operational announcement: ${exhaustive}`);
    }
  }

  return {
    message,
    priority,
    liveRegion: priority,
    fingerprint: `${id}|${event.kind}|${count ?? ''}|${message}`,
  };
}
