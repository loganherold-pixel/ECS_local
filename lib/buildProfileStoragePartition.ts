export type EcsBuildProfileEnvironment = {
  EXPO_PUBLIC_ECS_BUILD_PROFILE?: string;
  EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT?: string;
  EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED?: string;
};

export type EcsStoragePartition = {
  id: 'production' | 'route_discovery_qa';
  isolated: boolean;
  filePrefix: string;
  storageKeyPrefix: string;
  cloudVehicleSyncAllowed: boolean;
};

export const ROUTE_DISCOVERY_QA_STORAGE_PARTITION_ID = 'route_discovery_qa' as const;

export function resolveBuildProfileStoragePartition(
  env: EcsBuildProfileEnvironment = {
    EXPO_PUBLIC_ECS_BUILD_PROFILE: process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE,
    EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT:
      process.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT,
    EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED:
      process.env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED,
  },
): EcsStoragePartition {
  const routeDiscoveryQa =
    env.EXPO_PUBLIC_ECS_BUILD_PROFILE === 'route-discovery-qa' &&
    env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT === 'true' &&
    env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED === 'true';

  if (routeDiscoveryQa) {
    return {
      id: ROUTE_DISCOVERY_QA_STORAGE_PARTITION_ID,
      isolated: true,
      filePrefix: 'ecs_route_discovery_qa__',
      storageKeyPrefix: 'ecs:route-discovery-qa:',
      cloudVehicleSyncAllowed: false,
    };
  }

  return {
    id: 'production',
    isolated: false,
    filePrefix: '',
    storageKeyPrefix: '',
    cloudVehicleSyncAllowed: true,
  };
}

export function partitionPersistenceFileKey(
  fileKey: string,
  partition = resolveBuildProfileStoragePartition(),
): string {
  return `${partition.filePrefix}${fileKey}`;
}

export function partitionPersistenceStorageKey(
  key: string,
  partition = resolveBuildProfileStoragePartition(),
): string {
  return `${partition.storageKeyPrefix}${key}`;
}
