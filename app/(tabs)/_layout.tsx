/**
 * Tab Layout — Phase 9
 *
 * Hidden native tab bar for custom ECS command dock.
 * Primary tab order matches CommandDock left → right:
 * Fleet | Navigate | Dashboard (crest) | Discover | Alert
 *
 * Legacy tabs remain registered for deep links / backward compatibility.
 */
import React from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

const hiddenTabBarStyle: BottomTabNavigationOptions['tabBarStyle'] = {
  display: 'none',
  height: 0,
  overflow: 'hidden',
};

const primaryScreenOptions: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarShowLabel: false,
  tabBarStyle: hiddenTabBarStyle,
  animation: 'fade',
};

const hiddenRouteOptions: BottomTabNavigationOptions & { href: null } = {
  headerShown: false,
  tabBarStyle: hiddenTabBarStyle,
  href: null,
};

export default function TabLayout() {
  return (
    <Tabs screenOptions={primaryScreenOptions}>
      {/* Primary navigation tabs — visible to custom ECS dock */}
      <Tabs.Screen
        name="fleet"
        options={{
          title: 'Fleet',
        }}
      />
      <Tabs.Screen
        name="navigate"
        options={{
          title: 'Navigate',
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
        }}
      />
      <Tabs.Screen
        name="alert"
        options={{
          title: 'Alert',
        }}
      />

      {/* Legacy tabs — hidden from tab navigation, preserved for deep links */}
      <Tabs.Screen name="safety" options={hiddenRouteOptions} />
      <Tabs.Screen name="intel" options={hiddenRouteOptions} />
      <Tabs.Screen name="intelligence" options={hiddenRouteOptions} />
      <Tabs.Screen name="expeditions" options={hiddenRouteOptions} />
      <Tabs.Screen name="trips" options={hiddenRouteOptions} />
      <Tabs.Screen name="loaditems" options={hiddenRouteOptions} />
      <Tabs.Screen name="loadmap" options={hiddenRouteOptions} />
      <Tabs.Screen name="more" options={hiddenRouteOptions} />
      <Tabs.Screen name="vehicle-config" options={hiddenRouteOptions} />
      <Tabs.Screen name="route" options={hiddenRouteOptions} />
    </Tabs>
  );
}