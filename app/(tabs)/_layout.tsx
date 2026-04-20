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
import React from 'react';
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
  lazy: false,
};

const hiddenRouteOptions: BottomTabNavigationOptions & { href: null } = {
  headerShown: false,
  tabBarStyle: hiddenTabBarStyle,
  href: null,
};

export default function TabLayout() {
  const { palette, themeReady } = useTheme();
  const sceneBackgroundColor = themeReady ? palette.bg : ECS.bgPrimary;

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        ...primaryScreenOptions,
        sceneStyle: { backgroundColor: sceneBackgroundColor },
      }}
    >
      {/* Dashboard must mount first to avoid Fleet flashing on startup */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
        }}
      />

      {/* Primary navigation tabs — visible via custom ECS CommandDock */}
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
        name="discover"
        options={{
          title: 'Explore',
        }}
      />
      <Tabs.Screen
        name="alert"
        options={{
          title: 'Dispatch',
        }}
      />

      {/* Legacy tabs — hidden from tab navigation, preserved for deep links */}
      <Tabs.Screen
        name="safety"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
      <Tabs.Screen
        name="intel"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
      <Tabs.Screen
        name="intelligence"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
      <Tabs.Screen
        name="expeditions"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
      <Tabs.Screen
        name="trips"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
      <Tabs.Screen
        name="loaditems"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
      <Tabs.Screen
        name="loadmap"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
      <Tabs.Screen
        name="more"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
      <Tabs.Screen
        name="vehicle-config"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
      <Tabs.Screen
        name="route"
        options={{ ...hiddenRouteOptions, sceneStyle: { backgroundColor: sceneBackgroundColor } }}
      />
    </Tabs>
  );
}
