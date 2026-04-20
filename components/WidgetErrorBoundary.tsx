/**
 * WidgetErrorBoundary — Per-widget crash isolation
 */

import React, { Component, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { ecsLog } from '../lib/ecsLogger';
import { reportLayoutFailure } from '../lib/ecsIssueIntelligence';

const COLORS = {
  textMuted: '#8A8A85',
  amber: '#C48A2C',
};

interface WidgetErrorBoundaryProps {
  children: ReactNode;
  widgetType?: string;
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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const { widgetType, slotIndex } = this.props;
    const componentStack = info?.componentStack?.split('\n').slice(0, 6).join('\n') ?? null;

    ecsLog.error('WIDGET', `Widget "${widgetType || 'unknown'}" crashed at slot ${slotIndex ?? '?'}`, error, {
      widgetType,
      slotIndex,
      componentStack,
    });

    reportLayoutFailure({
      severity: 'medium',
      issueTitle: `Widget render failure: ${widgetType || 'unknown'}`,
      ecsArea: 'widgets',
      error,
      message: error?.message ?? 'Widget render failure',
      signature: `widget_boundary:${widgetType || 'unknown'}:${slotIndex ?? 'unknown'}:${error?.name ?? 'Error'}:${error?.message ?? ''}`,
      metadata: {
        widgetType: widgetType ?? null,
        slotIndex: typeof slotIndex === 'number' ? slotIndex : null,
        componentStack,
      },
    });
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.fallbackContainer}>
        <View style={styles.fallbackContent}>
          <Ionicons name="alert-circle-outline" size={20} color={COLORS.textMuted} />
          <Text style={styles.fallbackTitle}>Widget temporarily unavailable</Text>
          {this.state.retryCount < 3 ? (
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={this.handleRetry}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={10} color={COLORS.amber} />
              <Text style={styles.retryText}>REFRESH WIDGET</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.giveUpText}>Reopen Dashboard to restore this widget</Text>
          )}
        </View>
      </View>
    );
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
