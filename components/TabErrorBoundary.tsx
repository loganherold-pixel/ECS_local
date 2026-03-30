// ============================================================
// TAB ERROR BOUNDARY — Reusable crash-recovery wrapper
// ============================================================
// Wraps any tab's content so that if a child component throws
// a runtime error, the user sees a friendly recovery UI with
// a retry button instead of a blank screen or app crash.
//
// Usage:
//   import TabErrorBoundary from '../components/TabErrorBoundary';
//
//   export default function SomeScreen() {
//     return (
//       <TabErrorBoundary tabName="DASHBOARD">
//         <SomeScreenInner />
//       </TabErrorBoundary>
//     );
//   }
// ============================================================

import React, { Component, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';

// ── Inline theme constants (avoid importing theme to keep boundary self-contained) ──
const COLORS = {
  bg: '#0B0F12',
  panel: 'rgba(0,0,0,0.22)',
  text: '#E6E6E1',
  textMuted: '#8A8A85',
  amber: '#C48A2C',
  danger: '#C0392B',
  accent: 'rgba(62, 79, 60, 0.35)',
  border: 'rgba(62, 79, 60, 0.35)',
};

// ── Props & State ────────────────────────────────────────────
interface TabErrorBoundaryProps {
  children: ReactNode;
  /** Display name for the tab (e.g. "DASHBOARD", "NAVIGATE") */
  tabName: string;
  /** Optional callback fired when the user taps Retry */
  onRetry?: () => void;
}

interface TabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

// ── Component ────────────────────────────────────────────────
export default class TabErrorBoundary extends Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  state: TabErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<TabErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    // Wrapped in try/catch so the boundary never throws its own error
    try {
      const tag = `[${this.props?.tabName || 'TAB'}]`;
      console.error(tag, 'Error boundary caught:', error?.message ?? 'Unknown error');
      if (error?.stack) {
        console.error(tag, 'Stack:', error.stack.split('\n').slice(0, 4).join('\n'));
      }
      this.setState({
        errorInfo: info?.componentStack
          ? info.componentStack.split('\n').slice(0, 6).join('\n')
          : null,
      });
    } catch (_catchErr) {
      // Swallow — boundary must never re-throw
      this.setState({ errorInfo: null });
    }
  }


  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            {/* Icon */}
            <View style={styles.iconWrap}>
              <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} />
            </View>

            {/* Title */}
            <Text style={styles.title}>
              {this.props.tabName || 'TAB'} ERROR
            </Text>

            {/* Message */}
            <Text style={styles.message}>
              {this.state.error?.message || 'An ECS module encountered an unexpected error.'}
            </Text>


            {/* Retry Button */}
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={this.handleRetry}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={16} color={COLORS.text} />
              <Text style={styles.retryBtnText}>RETRY</Text>
            </TouchableOpacity>

            {/* Stack trace (collapsed, for debugging) */}
            {this.state.errorInfo && (
              <ScrollView style={styles.stackScroll} nestedScrollEnabled>
                <Text style={styles.stackText}>
                  {this.state.errorInfo}
                </Text>
              </ScrollView>
            )}

            {/* Footer hint */}
            <Text style={styles.hint}>
              If this keeps happening, try restarting the app.
            </Text>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 24 : 60,
  },
  content: {
    alignItems: 'center',
    gap: 12,
    maxWidth: 360,
    width: '100%',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(192, 57, 43, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.danger,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  message: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.amber,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 1.5,
  },
  stackScroll: {
    maxHeight: 120,
    width: '100%',
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    padding: 10,
  },
  stackText: {
    fontSize: 9,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    color: 'rgba(138, 138, 133, 0.6)',
    lineHeight: 14,
  },
  hint: {
    fontSize: 10,
    color: 'rgba(138, 138, 133, 0.4)',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});



