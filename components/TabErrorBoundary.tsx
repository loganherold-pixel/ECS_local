// ============================================================
// TAB ERROR BOUNDARY — Reusable crash-recovery wrapper
// ============================================================

import React, { Component, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { reportFatalIssue } from '../lib/ecsIssueIntelligence';

const COLORS = {
  bg: '#0B0F12',
  text: '#E6E6E1',
  textMuted: '#8A8A85',
  amber: '#C48A2C',
  danger: '#C0392B',
};

interface TabErrorBoundaryProps {
  children: ReactNode;
  tabName: string;
  onRetry?: () => void;
}

interface TabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

function mapTabToArea(tabName: string | null | undefined) {
  switch (String(tabName ?? '').toLowerCase()) {
    case 'fleet':
      return 'fleet' as const;
    case 'navigate':
      return 'navigate' as const;
    case 'dashboard':
      return 'dashboard' as const;
    case 'explore':
    case 'discover':
      return 'explore' as const;
    case 'alert':
      return 'alert' as const;
    default:
      return 'app_shell' as const;
  }
}

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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      const tag = `[${this.props?.tabName || 'TAB'}]`;
      console.error(tag, 'Error boundary caught:', error?.message ?? 'Unknown error');
      if (error?.stack) {
        console.error(tag, 'Stack:', error.stack.split('\n').slice(0, 4).join('\n'));
      }

      const componentStack = info?.componentStack
        ? info.componentStack.split('\n').slice(0, 8).join('\n')
        : null;

      this.setState({ errorInfo: componentStack });

      reportFatalIssue({
        severity: 'high',
        issueTitle: `${this.props?.tabName || 'TAB'} render failure`,
        ecsArea: mapTabToArea(this.props?.tabName),
        error,
        message: error?.message ?? 'Tab render failure',
        signature: `tab_boundary:${this.props?.tabName || 'tab'}:${error?.name ?? 'Error'}:${error?.message ?? ''}`,
        metadata: {
          tabName: this.props?.tabName ?? null,
          componentStack,
        },
      });
    } catch {
      this.setState({ errorInfo: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} />
          </View>

          <Text style={styles.title}>{this.props.tabName || 'This tab'} needs a refresh</Text>
          <Text style={styles.message}>
            {'ECS hit a temporary problem while loading this tab. Refresh to restore the current view.'}
          </Text>

          <TouchableOpacity
            style={styles.retryBtn}
            onPress={this.handleRetry}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={16} color={COLORS.text} />
            <Text style={styles.retryBtnText}>REFRESH TAB</Text>
          </TouchableOpacity>

          {__DEV__ && this.state.errorInfo ? (
            <ScrollView style={styles.stackScroll} nestedScrollEnabled>
              <Text style={styles.stackText}>{this.state.errorInfo}</Text>
            </ScrollView>
          ) : null}

          <Text style={styles.hint}>If it keeps happening, close and reopen ECS.</Text>
        </View>
      </View>
    );
  }
}

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
    color: COLORS.text,
    letterSpacing: 0.5,
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
