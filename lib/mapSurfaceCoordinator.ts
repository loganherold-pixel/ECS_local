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
