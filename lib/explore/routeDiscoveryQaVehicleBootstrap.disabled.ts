import type {
  RouteDiscoveryQaVehicleBootstrapSnapshot,
} from './routeDiscoveryQaVehicleBootstrap';

const NOT_APPLICABLE: RouteDiscoveryQaVehicleBootstrapSnapshot = {
  state: 'not_applicable',
  vehicleId: null,
  errorCode: null,
};

export const routeDiscoveryQaVehicleBootstrap = {
  snapshot: () => NOT_APPLICABLE,
  initialize: async () => NOT_APPLICABLE,
  retry: async () => NOT_APPLICABLE,
};
