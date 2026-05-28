/**
 * BluProviderRegistry — metadata and status for all supported power ecosystems.
 *
 * EcoFlow is the strongest currently verified provider path.
 * Other providers remain visible only with their present verification scope.
 *
 * This registry is read-only at runtime. Provider status transitions
 * (planned → active) happen via code updates, not user actions.
 */


import type { BluProviderMeta, BluProviderId } from './BluTypes';

// ── Provider Metadata ───────────────────────────────────────────────────

const PROVIDER_REGISTRY: BluProviderMeta[] = [
  {
    id: 'ecoflow',
    displayName: 'EcoFlow',
    status: 'verified',
    icon: 'flash',
    accentColor: '#00A6FF',
    statusNote: 'Verified ECS integration path',
  },
  {
    id: 'bluetti',
    displayName: 'Bluetti',
    status: 'implemented',
    icon: 'cube',
    accentColor: '#2196F3',
    statusNote: 'Implemented BLE path, pending broader field verification',
  },
  {
    id: 'anker_solix',
    displayName: 'Anker SOLIX',
    status: 'implemented',
    icon: 'battery-charging',
    accentColor: '#00C4B4',
    statusNote: 'Implemented BLE path, pending broader field verification',
  },
  {
    id: 'jackery',
    displayName: 'Jackery',
    status: 'implemented',
    icon: 'sunny',
    accentColor: '#FF8C00',
    statusNote: 'Implemented BLE path, pending broader field verification',
  },

  {
    id: 'goal_zero',
    displayName: 'Goal Zero',
    status: 'implemented',
    icon: 'compass',
    accentColor: '#4CAF50',
    statusNote: 'Implemented BLE path, pending broader field verification',
  },

  {
    id: 'renogy',
    displayName: 'Renogy',
    status: 'implemented',
    icon: 'hardware-chip',
    accentColor: '#FF5722',
    statusNote: 'Implemented telemetry path, pending broader field verification',
  },
  {
    id: 'redarc',
    displayName: 'REDARC',
    status: 'limited',
    icon: 'car',
    accentColor: '#C62828',
    statusNote: 'Limited integration path, not yet production-verified',
  },
  {
    id: 'dakota_lithium',
    displayName: 'Dakota Lithium',
    status: 'limited',
    icon: 'shield',
    accentColor: '#6FBF4B',
    statusNote: 'Limited integration path, not yet production-verified',
  },
  {
    id: 'victron',
    displayName: 'Victron Energy',
    status: 'limited',
    icon: 'git-network',
    accentColor: '#1976D2',
    statusNote: 'Native BLE telemetry path enabled; live promotion requires decoded hardware fields',
  },
];

// ── Public API ──────────────────────────────────────────────────────────

export function getAllProviders(): readonly BluProviderMeta[] {
  return PROVIDER_REGISTRY;
}

export function getActiveProviders(): BluProviderMeta[] {
  return PROVIDER_REGISTRY.filter((p) => p.status === 'verified' || p.status === 'implemented' || p.status === 'limited');
}

export function getPlannedProviders(): BluProviderMeta[] {
  return PROVIDER_REGISTRY.filter((p) => p.status === 'planned');
}

export function getProviderMeta(id: BluProviderId): BluProviderMeta | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function isProviderActive(id: BluProviderId): boolean {
  const meta = getProviderMeta(id);
  return meta?.status === 'verified' || meta?.status === 'implemented' || meta?.status === 'limited';
}

export function getProviderCount(): number {
  return PROVIDER_REGISTRY.length;
}

export function getActiveProviderCount(): number {
  return PROVIDER_REGISTRY.filter((p) => p.status === 'verified' || p.status === 'implemented' || p.status === 'limited').length;
}

