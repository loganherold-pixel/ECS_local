/**
 * CategoryPreview — Static Vehicle Preview for Category Selection
 * ────────────────────────────────────────────────────────────────
 * Displays a fixed preview image for each vehicle category.
 * The preview image does NOT change when accessories are selected.
 *
 * CATEGORY → IMAGE MAP:
 *   mid-size-suv     → mid_size_suv.png     → vehicleType: suv_van
 *   full-size-suv    → full_size_suv.png     → vehicleType: suv_van
 *   overland-truck   → overland_truck.png    → vehicleType: truck
 *   expedition-truck → expedition_truck.png  → vehicleType: truck
 *
 * Maps to existing vehicle type system:
 *   car_crossover → crossover category image
 *   suv_van       → mid-size or full-size SUV image
 *   truck         → overland or expedition truck image
 *   jeep          → jeep/4x4 category image
 *
 * LAYOUT:
 *   Desktop (>768): image left (50%), menu right (50%)
 *   Tablet  (>480): image top (40%), menu bottom (60%)
 *   Mobile  (<480): image top (35%), menu scrolls below
 *
 * PERFORMANCE:
 *   - Images load immediately when category is selected
 *   - No hover zoom, no accessory-driven updates
 *   - Image remains static reference
 */

import React, { useMemo, useRef, useEffect } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { TACTICAL } from '../../lib/theme';
import { MOTION, EASING } from '../../lib/motion';

// ── Category Image Registry ─────────────────────────────
// Maps vehicle type IDs to their static category preview images.
// These are separate from the ECS compositor base images —
// they show the vehicle in a real-world context, not as a
// transparent overlay layer.
//
// Using the existing base vehicle images from the ECS system
// as category previews. Replace URIs with actual category
// photos (mid_size_suv.png, etc.) when available.

interface CategoryImageEntry {
  /** Display name for the category */
  label: string;
  /** Category slug for binding logic */
  slug: string;
  /** Image URI */
  uri: string;
  /** Mapped vehicle type in the wizard system */
  wizardType: string;
  /** Subtitle description */
  description: string;
}

const CATEGORY_IMAGES: Record<string, CategoryImageEntry> = {
  // Car / Crossover
  car_crossover: {
    label: 'Crossover',
    slug: 'crossover',
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771708183232_b8077ba7.png',
    wizardType: 'car_crossover',
    description: 'Sedan, hatchback, or crossover platform',
  },
  // SUV / Van → maps to mid-size SUV category
  suv_van: {
    label: 'Mid-Size SUV',
    slug: 'mid-size-suv',
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771708181812_ef9d20dc.png',
    wizardType: 'suv_van',
    description: 'Sport utility vehicle or van with cargo space',
  },
  // Truck → maps to overland truck category
  truck: {
    label: 'Overland Truck',
    slug: 'overland-truck',
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771708180978_3cf7919f.png',
    wizardType: 'truck',
    description: 'Pickup truck with bed — full-size or mid-size',
  },
  // Jeep / 4x4
  jeep: {
    label: 'Jeep / 4x4',
    slug: 'jeep',
    uri: 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771708182614_13aef89c.png',
    wizardType: 'jeep',
    description: 'Wrangler, Bronco, or similar off-road platform',
  },
};

// Extended category slugs for the new category system
// These map the new slug-based categories to existing wizard types
const SLUG_TO_WIZARD_TYPE: Record<string, string> = {
  'mid-size-suv': 'suv_van',
  'full-size-suv': 'suv_van',
  'overland-truck': 'truck',
  'expedition-truck': 'truck',
  'crossover': 'car_crossover',
  'jeep': 'jeep',
};

// ── Props ───────────────────────────────────────────────
interface CategoryPreviewProps {
  /** Currently selected vehicle type from wizard (car_crossover, suv_van, truck, jeep) */
  selectedVehicleType: string | null;
  /** Container width for responsive layout */
  containerWidth?: number;
  /** Whether to show the label overlay */
  showLabel?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
}

export default function CategoryPreview({
  selectedVehicleType,
  containerWidth,
  showLabel = true,
  compact = false,
}: CategoryPreviewProps) {
  const screenWidth = containerWidth || Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const prevTypeRef = useRef<string | null>(null);

  // Resolve category entry
  const categoryEntry = useMemo(() => {
    if (!selectedVehicleType) return null;
    return CATEGORY_IMAGES[selectedVehicleType] || null;
  }, [selectedVehicleType]);

  // Animate on category change
  useEffect(() => {
    if (selectedVehicleType && selectedVehicleType !== prevTypeRef.current) {
      // Reset and animate in
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.95);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          easing: EASING.standard,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 400,
          easing: EASING.standard,
          useNativeDriver: true,
        }),
      ]).start();

      prevTypeRef.current = selectedVehicleType;
    } else if (!selectedVehicleType) {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        easing: EASING.standard,
        useNativeDriver: true,
      }).start();
      prevTypeRef.current = null;
    }
  }, [selectedVehicleType, fadeAnim, scaleAnim]);

  if (!categoryEntry) {
    return null;
  }

  // Responsive sizing
  const isDesktop = screenWidth > 768;
  const isTablet = screenWidth > 480 && screenWidth <= 768;

  // Image dimensions based on layout mode
  const imageSize = compact
    ? Math.min(screenWidth - 32, 200)
    : isDesktop
      ? Math.min(screenWidth * 0.45, 380)
      : isTablet
        ? Math.min(screenWidth - 32, 320)
        : Math.min(screenWidth - 32, 280);

  return (
    <Animated.View
      style={[
        styles.container,
        compact && styles.containerCompact,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {/* Image Container — 1:1 aspect ratio, contain scaling */}
      <View
        style={[
          styles.imageContainer,
          {
            width: imageSize,
            height: imageSize,
          },
        ]}
      >
        <Image
          source={{ uri: categoryEntry.uri }}
          style={styles.image}
          resizeMode="contain"
          fadeDuration={0}
        />

        {/* Subtle gradient overlay at bottom for label readability */}
        {showLabel && (
          <View style={styles.gradientOverlay} />
        )}
      </View>

      {/* Category Label */}
      {showLabel && (
        <View style={styles.labelContainer}>
          <View style={styles.labelAccent} />
          <View style={styles.labelTextWrap}>
            <Text style={styles.labelTitle}>{categoryEntry.label.toUpperCase()}</Text>
            <Text style={styles.labelDescription}>{categoryEntry.description}</Text>
          </View>
        </View>
      )}

      {/* Category slug badge */}
      {showLabel && (
        <View style={styles.slugBadge}>
          <View style={styles.slugDot} />
          <Text style={styles.slugText}>{categoryEntry.slug}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ── Export helpers for external use ──────────────────────

/**
 * Get the category image URI for a given vehicle type.
 * Returns null if no mapping exists.
 */
export function getCategoryImageUri(vehicleType: string): string | null {
  const entry = CATEGORY_IMAGES[vehicleType];
  return entry?.uri || null;
}

/**
 * Map a category slug to the existing wizard vehicle type.
 */
export function mapSlugToWizardType(slug: string): string | null {
  return SLUG_TO_WIZARD_TYPE[slug] || null;
}

/**
 * Get all available category entries.
 */
export function getAllCategories(): CategoryImageEntry[] {
  return Object.values(CATEGORY_IMAGES);
}

// ── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  containerCompact: {
    paddingVertical: 4,
  },

  // Image
  imageContainer: {
    position: 'relative',
    backgroundColor: 'rgba(62, 79, 60, 0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.15)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(11, 15, 18, 0.4)',
  },

  // Label
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  labelAccent: {
    width: 3,
    height: 18,
    borderRadius: 1.5,
    backgroundColor: '#C48A2C',
  },
  labelTextWrap: {
    gap: 2,
  },
  labelTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#E6E6E1',
    letterSpacing: 1.5,
  },
  labelDescription: {
    fontSize: 9,
    fontWeight: '500',
    color: '#8A8A85',
    letterSpacing: 0.5,
  },

  // Slug Badge
  slugBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  slugDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(196, 138, 44, 0.6)',
  },
  slugText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#8A8A85',
    letterSpacing: 0.8,
    fontFamily: 'Courier',
  },
});



