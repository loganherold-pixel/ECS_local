/**
 * Tab Layout — Phase 9
 *
 * Hidden native tab bar for custom ECS command dock.
 * Dashboard is intentionally registered FIRST so it mounts first on startup.
 * Visible dock order remains:
 * Fleet | Navigate | Dashboard | Explore | Dispatch
 *
 * Legacy tabs remain registered for deep links / backward compatibility.
 */
import React, { useMemo } from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { useTheme } from '../../context/ThemeContext';
import { ECS } from '../../lib/theme';

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
  lazy: true,
  freezeOnBlur: true,
};

const hiddenRouteOptions: BottomTabNavigationOptions & { href: null } = {
  headerShown: false,
  tabBarStyle: hiddenTabBarStyle,
  href: null,
};

const dashboardOptions: BottomTabNavigationOptions = { title: 'Dashboard' };
const fleetOptions: BottomTabNavigationOptions = { title: 'Fleet' };
const navigateOptions: BottomTabNavigationOptions = { title: 'Navigate' };
const discoverOptions: BottomTabNavigationOptions = { title: 'Explore' };
const alertOptions: BottomTabNavigationOptions = { title: 'Dispatch' };

export default function TabLayout() {
  const { themeReady } = useTheme();
  const sceneBackgroundColor = themeReady ? 'transparent' : ECS.bgPrimary;
  const sceneStyle = useMemo(
    () => ({ backgroundColor: sceneBackgroundColor }),
    [sceneBackgroundColor],
  );
  const tabScreenOptions = useMemo<BottomTabNavigationOptions>(
    () => ({
      ...primaryScreenOptions,
      sceneStyle,
    }),
    [sceneStyle],
  );
  const hiddenOptions = useMemo<BottomTabNavigationOptions & { href: null }>(
    () => ({
      ...hiddenRouteOptions,
      sceneStyle,
    }),
    [sceneStyle],
  );

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={tabScreenOptions}
    >
      {/* Dashboard must mount first to avoid Fleet flashing on startup */}
      <Tabs.Screen
        name="dashboard"
        options={dashboardOptions}
      />

      {/* Primary navigation tabs — visible via custom ECS CommandDock */}
      <Tabs.Screen
        name="fleet"
        options={fleetOptions}
      />
      <Tabs.Screen
        name="navigate"
        options={navigateOptions}
      />
      <Tabs.Screen
        name="discover"
        options={discoverOptions}
      />
      <Tabs.Screen
        name="alert"
        options={alertOptions}
      />

      {/* Legacy tabs — hidden from tab navigation, preserved for deep links */}
      <Tabs.Screen
        name="safety"
        options={hiddenOptions}
      />
      <Tabs.Screen
        name="intel"
        options={hiddenOptions}
      />
      <Tabs.Screen
        name="intelligence"
        options={hiddenOptions}
      />
      <Tabs.Screen
        name="expeditions"
        options={hiddenOptions}
      />
      <Tabs.Screen
        name="trips"
        options={hiddenOptions}
      />
      <Tabs.Screen
        name="loaditems"
        options={hiddenOptions}
      />
      <Tabs.Screen
        name="loadmap"
        options={hiddenOptions}
      />
      <Tabs.Screen
        name="more"
        options={hiddenOptions}
      />
      <Tabs.Screen
        name="vehicle-config"
        options={hiddenOptions}
      />
      <Tabs.Screen
        name="route"
        options={hiddenOptions}
      />
    </Tabs>
  );
}
