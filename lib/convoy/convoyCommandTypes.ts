export type ConvoyCommandVisualState = 'live' | 'estimated' | 'partial' | 'offline' | 'alert';

export type ConvoyCommandStatusLabel = 'LIVE' | 'ESTIMATED' | 'PARTIAL' | 'OFFLINE' | 'ALERT';

export type ConvoyMemberSummaryRole = 'lead' | 'tail' | 'member' | 'scout' | 'you';

export type ConvoyMemberSummary = {
  id: string;
  displayName: string;
  role?: ConvoyMemberSummaryRole;
  distanceFromUserMiles?: number | null;
  lastSeenAt?: string | number | Date | null;
  isReporting: boolean;
  isStale: boolean;
  isLostSignal: boolean;
};

export type ConvoyCommandWidgetViewModel = {
  visualState: ConvoyCommandVisualState;
  statusLabel: ConvoyCommandStatusLabel;
  groupName: string;
  vehicleCount: number;
  reportingCount: number;
  widestGapMiles: number | null;
  regroupSuggested: boolean;
  lostUnitIndex: number;
  cautionLevel: 0 | 1 | 2;
  alertText: string | null;
  members: ConvoyMemberSummary[];
  isUsingLiveData: boolean;
  updatedAt: string | number | Date | null;
};
