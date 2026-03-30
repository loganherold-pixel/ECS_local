/**
 * ECS SVG Renderer
 * ─────────────────────────────────────────────────────────
 * Cross-platform SVG rendering for React Native.
 *
 * Web: Uses React.createElement with string tags to render
 *      actual SVG DOM elements (supported by react-native-web).
 *
 * Native: Falls back to a simplified View-based representation
 *         using the vehicle's bounding box.
 *
 * All rendering uses the 1024×1024 viewBox coordinate system.
 * The component scales to fit its container via viewBox.
 */

import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import type { SvgShape } from './spec';
import { VIEWBOX, FILL_PRIMARY, WHEEL } from './spec';

// ── Types ───────────────────────────────────────────────
interface SvgRendererProps {
  /** Width of the rendered SVG */
  width: number;
  /** Height of the rendered SVG */
  height: number;
  /** Fill color (default: #D4AF37) */
  fill?: string;
  /** Background color for cutouts (default: transparent) */
  cutoutFill?: string;
  /** Body path shapes */
  bodyShapes: SvgShape[];
  /** Window cutout shapes */
  windowShapes?: SvgShape[];
  /** Wheel definitions: [cx, cy, tireR, rimR, hubR][] */
  wheels?: [number, number, number, number, number][];
  /** Module overlay shapes */
  moduleShapes?: SvgShape[];
  /** Opacity (0-1) */
  opacity?: number;
  /** Additional viewBox override */
  viewBox?: string;
}

// ── Web SVG Renderer ────────────────────────────────────
function WebSvgRenderer({
  width,
  height,
  fill = FILL_PRIMARY,
  cutoutFill = 'transparent',
  bodyShapes,
  windowShapes = [],
  wheels = [],
  moduleShapes = [],
  opacity = 1,
  viewBox = VIEWBOX,
}: SvgRendererProps) {
  const children: React.ReactElement[] = [];
  let keyIdx = 0;

  // Body shapes
  for (const shape of bodyShapes) {
    children.push(
      React.createElement('path', {
        key: `body-${keyIdx++}`,
        d: shape.d,
        fill,
        fillRule: shape.fillRule || 'nonzero',
      })
    );
  }

  // Window cutouts (rendered as background-colored shapes on top)
  for (const win of windowShapes) {
    children.push(
      React.createElement('path', {
        key: `win-${keyIdx++}`,
        d: win.d,
        fill: cutoutFill,
      })
    );
  }

  // Wheels — concentric circles
  for (const [cx, cy, tireR, rimR, hubR] of wheels) {
    // Tire (outer) — cutout from body
    children.push(
      React.createElement('circle', {
        key: `tire-${keyIdx++}`,
        cx,
        cy,
        r: WHEEL.ARCH_R - 2,
        fill: cutoutFill,
      })
    );
    // Tire ring
    children.push(
      React.createElement('circle', {
        key: `tirering-${keyIdx++}`,
        cx,
        cy,
        r: tireR,
        fill,
      })
    );
    // Rim cutout
    children.push(
      React.createElement('circle', {
        key: `rim-${keyIdx++}`,
        cx,
        cy,
        r: rimR,
        fill: cutoutFill,
      })
    );
    // Hub
    children.push(
      React.createElement('circle', {
        key: `hub-${keyIdx++}`,
        cx,
        cy,
        r: hubR,
        fill,
      })
    );
    // Hub center cutout
    children.push(
      React.createElement('circle', {
        key: `hubctr-${keyIdx++}`,
        cx,
        cy,
        r: 4,
        fill: cutoutFill,
      })
    );
  }

  // Module overlay shapes
  for (const shape of moduleShapes) {
    children.push(
      React.createElement('path', {
        key: `mod-${keyIdx++}`,
        d: shape.d,
        fill,
        fillRule: shape.fillRule || 'nonzero',
      })
    );
  }

  return React.createElement(
    'svg',
    {
      viewBox,
      preserveAspectRatio: 'xMidYMid meet',
      width,
      height,
      style: {
        display: 'block',
        opacity,
      },
      xmlns: 'http://www.w3.org/2000/svg',
    },
    ...children
  );

}

// ── Native Fallback Renderer ────────────────────────────
// Simplified View-based rendering for native platforms
function NativeSvgRenderer({
  width,
  height,
  fill = FILL_PRIMARY,
  opacity = 1,
}: SvgRendererProps) {
  // On native without react-native-svg, render a simplified
  // vehicle silhouette using Views
  return (
    <View
      style={[
        styles.nativeContainer,
        {
          width,
          height,
          opacity,
        },
      ]}
    >
      {/* Simplified vehicle body shape */}
      <View
        style={[
          styles.nativeBody,
          {
            backgroundColor: fill,
            width: width * 0.7,
            height: height * 0.25,
            top: height * 0.35,
            left: width * 0.15,
            borderRadius: 6,
          },
        ]}
      />
      {/* Cab (taller section) */}
      <View
        style={[
          styles.nativeCab,
          {
            backgroundColor: fill,
            width: width * 0.3,
            height: height * 0.15,
            top: height * 0.22,
            left: width * 0.2,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
          },
        ]}
      />
      {/* Front wheel */}
      <View
        style={[
          styles.nativeWheel,
          {
            borderColor: fill,
            width: width * 0.1,
            height: width * 0.1,
            borderRadius: width * 0.05,
            bottom: height * 0.15,
            left: width * 0.22,
          },
        ]}
      />
      {/* Rear wheel */}
      <View
        style={[
          styles.nativeWheel,
          {
            borderColor: fill,
            width: width * 0.1,
            height: width * 0.1,
            borderRadius: width * 0.05,
            bottom: height * 0.15,
            right: width * 0.22,
          },
        ]}
      />
    </View>
  );
}

// ── Exported Renderer ───────────────────────────────────
export default function SvgRenderer(props: SvgRendererProps) {
  if (Platform.OS === 'web') {
    return <WebSvgRenderer {...props} />;
  }
  return <NativeSvgRenderer {...props} />;
}

// ── Standalone SVG string generator (for export) ────────
export function generateSvgString(
  shapes: SvgShape[],
  fill: string = FILL_PRIMARY,
  viewBox: string = VIEWBOX,
): string {
  const paths = shapes
    .map(
      (s) =>
        `  <path d="${s.d}" fill="${fill}"${s.fillRule ? ` fill-rule="${s.fillRule}"` : ''} />`
    )
    .join('\n');

  return [
    `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">`,
    paths,
    `</svg>`,
  ].join('\n');
}

// ── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  nativeContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  nativeBody: {
    position: 'absolute',
  },
  nativeCab: {
    position: 'absolute',
  },
  nativeWheel: {
    position: 'absolute',
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
});



