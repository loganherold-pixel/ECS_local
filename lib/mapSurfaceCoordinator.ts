export type MapSurfaceKind =
  | 'navigate'
  | 'dashboard'
  | 'dispatch'
  | 'explore'
  | 'trail-pack-preview'
  | 'route-preview'
  | 'other';

export type MapMotionPriority = 'hot' | 'warm' | 'cold';

export type MapSurfaceMotionInput = {
  surface: MapSurfaceKind;
  isFocused?: boolean;
  selected?: boolean;
  hasActiveGuidance?: boolean;
  previewOnly?: boolean;
};

export type MapSurfaceMotionState = {
  motionPriority: MapMotionPriority;
  allowLiveLocation: boolean;
  allowCameraFollow: boolean;
  allowDynamicCamera: boolean;
};

export function resolveMapSurfaceMotionState(input: MapSurfaceMotionInput): MapSurfaceMotionState {
  const focused = input.isFocused !== false;
  const selected = input.selected !== false;

  if (!focused || !selected) {
    return {
      motionPriority: 'cold',
      allowLiveLocation: false,
      allowCameraFollow: false,
      allowDynamicCamera: false,
    };
  }

  if (input.surface === 'navigate') {
    if (!input.hasActiveGuidance) {
      return {
        motionPriority: 'warm',
        allowLiveLocation: true,
        allowCameraFollow: true,
        allowDynamicCamera: false,
      };
    }

    return {
      motionPriority: 'hot',
      allowLiveLocation: true,
      allowCameraFollow: true,
      allowDynamicCamera: true,
    };
  }

  if (input.surface === 'dashboard' && selected) {
    return {
      motionPriority: input.hasActiveGuidance ? 'hot' : 'warm',
      allowLiveLocation: true,
      allowCameraFollow: true,
      allowDynamicCamera: true,
    };
  }

  if (input.hasActiveGuidance || input.previewOnly) {
    return {
      motionPriority: input.previewOnly ? 'warm' : 'cold',
      allowLiveLocation: !!input.previewOnly,
      allowCameraFollow: false,
      allowDynamicCamera: false,
    };
  }

  return {
    motionPriority: 'warm',
    allowLiveLocation: true,
    allowCameraFollow: false,
    allowDynamicCamera: false,
  };
}

export type MapCameraCommandKind =
  | 'emergency_focus'
  | 'selected_context'
  | 'route_overview'
  | 'recenter'
  | 'follow_user'
  | 'passive';

export type MapCameraCommandDecision = {
  accepted: boolean;
  reason: 'accepted' | 'duplicate' | 'lower_priority_settling';
  sequence: number;
};

const MAP_CAMERA_COMMAND_PRIORITY: Readonly<Record<MapCameraCommandKind, number>> = {
  emergency_focus: 60,
  selected_context: 50,
  route_overview: 40,
  recenter: 30,
  follow_user: 20,
  passive: 10,
};

export class MapCameraCommandCoordinator {
  private lastSignature: string | null = null;
  private lastKind: MapCameraCommandKind = 'passive';
  private lastAcceptedAt = Number.NEGATIVE_INFINITY;
  private sequence = 0;

  constructor(private readonly settleWindowMs = 700) {}

  request(input: {
    signature: string;
    kind: MapCameraCommandKind;
    now?: number;
    force?: boolean;
  }): MapCameraCommandDecision {
    const now = input.now ?? Date.now();
    if (!input.force && input.signature === this.lastSignature) {
      return { accepted: false, reason: 'duplicate', sequence: this.sequence };
    }

    const settling = now - this.lastAcceptedAt < this.settleWindowMs;
    const lowerPriority =
      MAP_CAMERA_COMMAND_PRIORITY[input.kind] < MAP_CAMERA_COMMAND_PRIORITY[this.lastKind];
    if (!input.force && settling && lowerPriority) {
      return {
        accepted: false,
        reason: 'lower_priority_settling',
        sequence: this.sequence,
      };
    }

    this.sequence += 1;
    this.lastSignature = input.signature;
    this.lastKind = input.kind;
    this.lastAcceptedAt = now;
    return { accepted: true, reason: 'accepted', sequence: this.sequence };
  }

  reset(): void {
    this.lastSignature = null;
    this.lastKind = 'passive';
    this.lastAcceptedAt = Number.NEGATIVE_INFINITY;
  }
}
