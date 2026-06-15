import {
  CAMPSITE_VISIBILITY_LAYER_TOGGLES,
  type CampsiteVisibilityLayerToggle,
} from '../campsites/campsiteVisibilityMapLayers';

export type CampLayerMenuOperatorInfo = {
  is_admin?: boolean | null;
  role?: string | null;
} | null | undefined;

export type ResolveCampLayerMenuTogglesInput = {
  communityCampsitesEnabled: boolean;
  campsiteCommunityReviewEnabled: boolean;
  operatorInfo?: CampLayerMenuOperatorInfo;
};

export type ResolveCampLayerMenuLayoutInput = {
  mapHeight: number;
  viewportWidth?: number;
  topInset: number;
  bottomOffset: number;
  overlayEdge: number;
  triggerSize: number;
  railGap?: number;
  triggerCount?: number;
  width?: number;
};

export type CampLayerMenuLayout = {
  width: number;
  maxWidth: number;
  maxHeight: number;
};

const DEFAULT_MENU_WIDTH = 276;
const DEFAULT_RAIL_GAP = 6;
const DEFAULT_TRIGGER_COUNT = 4;
const MIN_MENU_HEIGHT = 156;

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function roundedPositive(value: number): number {
  return Math.max(0, Math.round(value));
}

export function userCanSeeCommunityCampLayerTools(operatorInfo: CampLayerMenuOperatorInfo): boolean {
  if (!operatorInfo) return false;
  const role = String(operatorInfo.role ?? '').toLowerCase();
  return operatorInfo.is_admin === true || role === 'super_admin' || role === 'admin';
}

export function resolveCampLayerMenuToggles(
  input: ResolveCampLayerMenuTogglesInput,
): CampsiteVisibilityLayerToggle[] {
  if (!input.communityCampsitesEnabled || !userCanSeeCommunityCampLayerTools(input.operatorInfo)) {
    return [];
  }
  return CAMPSITE_VISIBILITY_LAYER_TOGGLES.filter((layer) => (
    !layer.privileged || input.campsiteCommunityReviewEnabled
  ));
}

export function resolveCampLayerMenuLayout(input: ResolveCampLayerMenuLayoutInput): CampLayerMenuLayout {
  const mapHeight = roundedPositive(finiteNumber(input.mapHeight, 0));
  const topInset = roundedPositive(finiteNumber(input.topInset, 0));
  const bottomOffset = roundedPositive(finiteNumber(input.bottomOffset, 0));
  const overlayEdge = roundedPositive(finiteNumber(input.overlayEdge, 12));
  const triggerSize = roundedPositive(finiteNumber(input.triggerSize, 40));
  const railGap = roundedPositive(finiteNumber(input.railGap ?? DEFAULT_RAIL_GAP, DEFAULT_RAIL_GAP));
  const triggerCount = Math.max(1, Math.round(finiteNumber(input.triggerCount ?? DEFAULT_TRIGGER_COUNT, DEFAULT_TRIGGER_COUNT)));
  const width = roundedPositive(finiteNumber(input.width ?? DEFAULT_MENU_WIDTH, DEFAULT_MENU_WIDTH));
  const viewportWidth = roundedPositive(finiteNumber(input.viewportWidth ?? input.mapHeight, input.mapHeight));
  const reservedToolRailHeight = triggerCount * triggerSize + triggerCount * railGap;
  const availableHeight = mapHeight - topInset - bottomOffset - reservedToolRailHeight - overlayEdge;
  return {
    width,
    maxWidth: Math.max(0, viewportWidth - overlayEdge * 2),
    maxHeight: Math.max(MIN_MENU_HEIGHT, roundedPositive(availableHeight)),
  };
}
