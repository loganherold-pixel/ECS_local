/**
 * WidgetErrorBoundary — Per-widget crash isolation
 * Phase 10: Stability + Crash Protection Layer
 *
 * Wraps individual widget rendering so that if a single widget
 * throws a runtime error, it shows a clean fallback card instead
 * of crashing the entire dashboard.
 *
 * Fallback displays: "Widget temporarily unavailable"
 * Includes a retry button to attempt re-render.
 *
 * CRITICAL: Prevents a single widget failure from crashing
 * the entire dashboard grid.
 */

import React, { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { ecsLog } from '../lib/ecsLogger';

// Inline theme constants (avoid importing theme to keep boundary self-contained)
const COLORS = {
  bg: '#0B0F12',
  panel: 'rgba(0,0,0,0.22)',
  text: '#E6E6E1',
  textMuted: '#8A8A85',
  amber: '#C48A2C',
  danger: '#C0392B',
  border: 'rgba(62, 79, 60, 0.35)',
};

interface WidgetErrorBoundaryProps {
  children: ReactNode;
  /** Widget type identifier for logging */
  widgetType?: string;
  /** Slot index for logging */
  slotIndex?: number;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export default class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  state: WidgetErrorBoundaryState = {
    hasError: false,
    error: null,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<WidgetErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    const { widgetType, slotIndex } = this.props;
    ecsLog.error('WIDGET', `Widget "${widgetType || 'unknown'}" crashed at slot ${slotIndex ?? '?'}`, error, {
      widgetType,
      slotIndex,
      componentStack: info?.componentStack?.split('\n').slice(0, 4).join('\n'),
    });
  }

  handleRetry = () => {
    this.setState(prev => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.fallbackContainer}>
          <View style={styles.fallbackContent}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={COLORS.textMuted}
            />
            <Text style={styles.fallbackTitle}>
              Widget temporarily unavailable
            </Text>
            {this.state.retryCount < 3 && (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={this.handleRetry}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={10} color={COLORS.amber} />
                <Text style={styles.retryText}>RETRY</Text>
              </TouchableOpacity>
            )}
            {this.state.retryCount >= 3 && (
              <Text style={styles.giveUpText}>
                Restart app to restore
              </Text>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  fallbackContent: {
    alignItems: 'center',
    gap: 6,
  },
  fallbackTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.amber + '40',
    backgroundColor: COLORS.amber + '08',
    marginTop: 4,
  },
  retryText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.amber,
    letterSpacing: 1.5,
  },
  giveUpText: {
    fontSize: 8,
    fontWeight: '600',
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
});



