import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ImageSourcePropType,
  Platform,
} from 'react-native';

export type ECSTabKey = 'fleet' | 'navigate' | 'center' | 'discover' | 'alert';

type Props = {
  activeTab: ECSTabKey;
  onFleetPress: () => void;
  onNavigatePress: () => void;
  onCenterPress: () => void;
  onDiscoverPress: () => void;
  onAlertPress: () => void;
};

type TabItem = {
  key: ECSTabKey;
  label: string;
  icon: ImageSourcePropType;
  onPress: () => void;
  isCenter?: boolean;
};

const ICONS = {
  fleet: require('../../assets/ecs/nav/fleet-badge.png'),
  navigate: require('../../assets/ecs/nav/navigate-badge.png'),
  center: require('../../assets/ecs/nav/ecs-center.png'),
  discover: require('../../assets/ecs/nav/discover-badge.png'),
  alert: require('../../assets/ecs/nav/alert-badge.png'),
};

function NavButton({
  item,
  active,
}: {
  item: TabItem;
  active: boolean;
}) {
  const isCenter = !!item.isCenter;

  return (
    <Pressable
      onPress={item.onPress}
      style={({ pressed }) => [
        styles.buttonWrap,
        isCenter && styles.centerButtonWrap,
        pressed && styles.pressed,
      ]}
      android_ripple={{ color: 'rgba(198,162,90,0.12)', borderless: true }}
    >
      <View style={[styles.iconShell, isCenter && styles.centerShell]}>
        <Image
          source={item.icon}
          resizeMode="contain"
          style={[
            styles.iconImage,
            isCenter ? styles.centerIconImage : styles.outerIconImage,
            !active && !isCenter && styles.inactiveIcon,
          ]}
        />
      </View>

      {!isCenter && (
        <Text style={[styles.label, active ? styles.activeLabel : styles.inactiveLabel]}>
          {item.label}
        </Text>
      )}
    </Pressable>
  );
}

export default function ECSBottomNav({
  activeTab,
  onFleetPress,
  onNavigatePress,
  onCenterPress,
  onDiscoverPress,
  onAlertPress,
}: Props) {
  const tabs: TabItem[] = [
    { key: 'fleet', label: 'FLEET', icon: ICONS.fleet, onPress: onFleetPress },
    { key: 'navigate', label: 'NAVIGATE', icon: ICONS.navigate, onPress: onNavigatePress },
    { key: 'center', label: 'ECS', icon: ICONS.center, onPress: onCenterPress, isCenter: true },
    { key: 'discover', label: 'DISCOVER', icon: ICONS.discover, onPress: onDiscoverPress },
    { key: 'alert', label: 'ALERT', icon: ICONS.alert, onPress: onAlertPress },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.topLine} />
      <View style={styles.container}>
        {tabs.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={activeTab === item.key}
          />
        ))}
      </View>
    </View>
  );
}

const GOLD = '#C6A25A';
const GOLD_BRIGHT = '#E3C17C';
const INACTIVE = '#7A828C';

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 12,
    backgroundColor: 'rgba(8, 11, 15, 0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  topLine: {
    position: 'absolute',
    top: 0,
    left: 22,
    right: 22,
    height: 1,
    backgroundColor: 'rgba(198,162,90,0.10)',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  buttonWrap: {
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  centerButtonWrap: {
    marginTop: -18,
  },
  iconShell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerShell: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  iconImage: {
    width: 58,
    height: 58,
  },
  outerIconImage: {
    width: 56,
    height: 56,
  },
  centerIconImage: {
    width: 82,
    height: 82,
  },
  inactiveIcon: {
    opacity: 0.5,
  },
  label: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3,
  },
  activeLabel: {
    color: GOLD_BRIGHT,
    textShadowColor: 'rgba(198,162,90,0.22)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  inactiveLabel: {
    color: INACTIVE,
  },
  pressed: {
    opacity: 0.86,
  },
});