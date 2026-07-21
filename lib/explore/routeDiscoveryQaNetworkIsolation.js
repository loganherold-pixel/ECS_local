function isRouteDiscoveryQaProfile(env = process.env) {
  return env.EXPO_PUBLIC_ECS_BUILD_PROFILE === 'route-discovery-qa' &&
    env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT === 'true';
}

function applyRouteDiscoveryQaNetworkIsolation(env = process.env) {
  const requested = env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED === 'true';
  const qaProfile = isRouteDiscoveryQaProfile(env);
  if (requested && !qaProfile) {
    throw new Error('Supabase network isolation is restricted to the route-discovery-qa build profile.');
  }
  if (!qaProfile) return false;

  delete env.EXPO_PUBLIC_SUPABASE_URL;
  delete env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED = 'true';
  return true;
}

module.exports = {
  applyRouteDiscoveryQaNetworkIsolation,
  isRouteDiscoveryQaProfile,
};
