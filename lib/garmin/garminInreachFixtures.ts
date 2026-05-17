import type { GarminInreachWorkflowFixture } from './garminInreachTypes';

export const GARMIN_INREACH_WORKFLOW_FIXTURES: GarminInreachWorkflowFixture[] = [
  {
    name: 'location update',
    event: {
      id: 'garmin-event-location-1',
      type: 'location',
      receivedAt: '2026-04-28T16:00:00.000Z',
      expeditionId: 'expedition-1',
      device: { imei: '300434123456789', displayName: 'Lead inReach' },
      coordinates: { latitude: 38.7807, longitude: -121.2076 },
      locationAccuracyM: 25,
    },
    expectedLiveType: 'team_ping',
    expectedSeverity: 'info',
    expectsHumanReview: false,
  },
  {
    name: 'satellite message',
    event: {
      id: 'garmin-event-message-1',
      type: 'message',
      receivedAt: '2026-04-28T16:05:00.000Z',
      expeditionId: 'expedition-1',
      device: { imei: '300434123456789' },
      sender: { callsign: 'V1' },
      messageText: 'Delayed at turnout. No immediate help needed.',
    },
    expectedLiveType: 'team_ping',
    expectedSeverity: 'warning',
    expectsHumanReview: false,
  },
  {
    name: 'sos signal',
    event: {
      id: 'garmin-event-sos-1',
      type: 'sos',
      receivedAt: '2026-04-28T16:10:00.000Z',
      expeditionId: 'expedition-1',
      device: { imei: '300434123456789' },
      sosStatus: 'triggered',
      coordinates: { latitude: 38.781, longitude: -121.208 },
    },
    expectedLiveType: 'assistance',
    expectedSeverity: 'critical',
    expectsHumanReview: true,
  },
];
