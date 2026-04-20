/**
 * AccessoryIcons — Category-specific icons for the Accessory Framework
 *
 * Uses MaterialCommunityIcons from @expo/vector-icons for more literal,
 * recognizable symbols per accessory category.
 *
 * ECS styling: thin-line, simple, high contrast, no filled blobs,
 * consistent stroke weight and icon size.
 *
 * Fallback: If MaterialCommunityIcons fails to load, falls back to
 * Ionicons via SafeIcon with the original generic icons.
 */
import React from 'react';

import { SafeIcon } from '../SafeIcon';

// ── Attempt to load MaterialCommunityIcons ───────────────────
let MCIComponent: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@expo/vector-icons');
  if (mod && mod.MaterialCommunityIcons) {
    MCIComponent = mod.MaterialCommunityIcons;
  }
} catch {
  // Silently fail
}

if (!MCIComponent) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@expo/vector-icons/MaterialCommunityIcons');
    if (mod && (mod.default || mod)) {
      MCIComponent = mod.default || mod;
    }
  } catch {
    // Silently fail
  }
}

// ── Category → MaterialCommunityIcons name mapping ──────────
// Each icon chosen for maximum specificity and recognizability.
// All outline/thin-line variants where available.
const CATEGORY_ICON_MAP: Record<string, { mci: string; fallback: string }> = {
  cab_rack: {
    mci: 'truck-flatbed',          // Truck cab with rack/flatbed roofline
    fallback: 'barbell-outline',
  },
  cab_rack_acc: {
    mci: 'car-light-high',         // Light bar / awning accessory symbol
    fallback: 'layers-outline',
  },
  bed_drawer: {
    mci: 'archive-arrow-down-outline', // Drawer / sliding tray
    fallback: 'server-outline',
  },
  roof_rack: {
    mci: 'car-select',             // Crossbars / roof rails silhouette
    fallback: 'resize-outline',
  },
  rtt: {
    mci: 'tent',                   // Rooftop tent
    fallback: 'trail-sign-outline',
  },
  interior_storage: {
    mci: 'package-variant-closed', // Storage bins / crate
    fallback: 'file-tray-stacked-outline',
  },
  fridge_slide: {
    mci: 'fridge-outline',         // Fridge
    fallback: 'snow-outline',
  },
  recovery_mount: {
    mci: 'hook',                   // Recovery hook / tow point
    fallback: 'construct-outline',
  },
  water_storage: {
    mci: 'water-pump',             // Jerry can / water container
    fallback: 'water-outline',
  },
  power_system: {
    mci: 'battery-charging',       // Battery with terminals
    fallback: 'flash-outline',
  },
};

// ── Props ────────────────────────────────────────────────────
interface AccessoryIconProps {
  /** The accessory category ID (e.g., 'cab_rack', 'rtt') */
  categoryId: string;
  /** Icon size in pixels */
  size?: number;
  /** Icon color */
  color?: string;
  /** Optional style override */
  style?: any;
}

/**
 * Renders a category-specific icon for the given accessory category.
 * Uses MaterialCommunityIcons for specificity, with Ionicons fallback.
 */
export function AccessoryIcon({
  categoryId,
  size = 14,
  color = '#8A8A85',
  style,
}: AccessoryIconProps) {
  const mapping = CATEGORY_ICON_MAP[categoryId];

  if (!mapping) {
    // Unknown category — render a generic icon
    return <SafeIcon name="cube-outline" size={size} color={color} style={style} />;
  }

  // Try MaterialCommunityIcons first
  if (MCIComponent) {
    try {
      return (
        <MCIComponent
          name={mapping.mci}
          size={size}
          color={color}
          style={style}
        />
      );
    } catch {
      // Fall through to Ionicons fallback
    }
  }

  // Fallback to Ionicons via SafeIcon
  return <SafeIcon name={mapping.fallback} size={size} color={color} style={style} />;
}

export default AccessoryIcon;



