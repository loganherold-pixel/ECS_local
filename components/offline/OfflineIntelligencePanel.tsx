/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE INTELLIGENCE PANEL
 * ═══════════════════════════════════════════════════════════
 *
 * Displays calm, tactical intelligence messages about the
 * current offline state. Adapts to show relevant information
 * without spamming connectivity notices.
 *
 * Messages include:
 *   - Connectivity state changes
 *   - Data availability status
 *   - System availability notes
 *   - Route/position coverage
 *   - Resource tracking status
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineExpeditionModeEngine } from '../../lib/offlineExpeditionModeEngine';
import type { OfflineIntelMessage } from '../../lib/offlineExpeditionModeTypes';

interface OfflineIntelligencePanelProps {
  /** Maximum messages to show */
  maxMessages?: number;
  /** Show in compact mode */
  compact?: boolean;
  /** Show header */
  showHeader?: boolean;
}

export default function OfflineIntelligencePanel({
  maxMessages = 4,
  compact = false,
  showHeader = true,
}: OfflineIntelligencePanelProps) {
  const [messages, setMessages] = useState<OfflineIntelMessage[]>([]);
  const [connState, setConnState] = useState('online');
  const [intelMessage, setIntelMessage] = useState('');

  const refresh = useCallback(() => {
    setMessages(offlineExpeditionModeEngine.getRecentMessages(maxMessages));
    setConnState(offlineExpeditionModeEngine.getConnectivityState());
    setIntelMessage(offlineExpeditionModeEngine.getIntelligenceMessage());
  }, [maxMessages]);

  useEffect(() => {
    refresh();
    const unsub = offlineExpeditionModeEngine.subscribe(refresh);
    return unsub;
  }, [refresh]);

  const handleDismiss = useCallback((key: string) => {
    offlineExpeditionModeEngine.dismissMessage(key);
    refresh();
  }, [refresh]);

  // Don't show when online with no messages
  if (connState === 'online' && messages.length === 0) return null;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Ionicons name="information-circle-outline" size={14} color="#78909C" />
        <Text style={styles.compactText} numberOfLines={1}>
          {intelMessage}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader && (
        <View style={styles.header}>
          <Ionicons name="radio-outline" size={14} color="#C48A2C" />
          <Text style={styles.headerTitle}>Expedition Intelligence</Text>
          {messages.length > 0 && (
            <TouchableOpacity
              onPress={() => offlineExpeditionModeEngine.clearMessages()}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Main Intelligence Message */}
      <View style={styles.mainMessage}>
        <Text style={styles.mainMessageText}>{intelMessage}</Text>
      </View>

      {/* Message List */}
      {messages.length > 0 && (
        <View style={styles.messageList}>
          {messages.map((msg) => (
            <View key={msg.key} style={styles.messageRow}>
              <Ionicons
                name={msg.icon as any}
                size={13}
                color={msg.color}
              />
              <Text style={styles.messageText} numberOfLines={2}>
                {msg.message}
              </Text>
              <TouchableOpacity
                onPress={() => handleDismiss(msg.key)}
                style={styles.dismissBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={12} color="#555" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Coverage Status */}
      {connState !== 'online' && (
        <View style={styles.coverageRow}>
          <View style={styles.coverageItem}>
            <Ionicons
              name={offlineExpeditionModeEngine.coversCurrentPosition()
                ? 'location' : 'location-outline'}
              size={12}
              color={offlineExpeditionModeEngine.coversCurrentPosition()
                ? '#4CAF50' : '#555'}
            />
            <Text style={[
              styles.coverageText,
              { color: offlineExpeditionModeEngine.coversCurrentPosition()
                ? '#4CAF50' : '#555' },
            ]}>
              Position {offlineExpeditionModeEngine.coversCurrentPosition()
                ? 'covered' : 'not cached'}
            </Text>
          </View>
          <View style={styles.coverageItem}>
            <Ionicons
              name={offlineExpeditionModeEngine.coversActiveRoute()
                ? 'navigate' : 'navigate-outline'}
              size={12}
              color={offlineExpeditionModeEngine.coversActiveRoute()
                ? '#4CAF50' : '#555'}
            />
            <Text style={[
              styles.coverageText,
              { color: offlineExpeditionModeEngine.coversActiveRoute()
                ? '#4CAF50' : '#555' },
            ]}>
              Route {offlineExpeditionModeEngine.coversActiveRoute()
                ? 'cached' : 'not cached'}
            </Text>
          </View>
          {offlineExpeditionModeEngine.getTotalOfflineDataMb() > 0 && (
            <View style={styles.coverageItem}>
              <Ionicons name="server-outline" size={12} color="#888" />
              <Text style={styles.coverageText}>
                {offlineExpeditionModeEngine.getTotalOfflineDataMb().toFixed(1)} MB cached
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D0D0D0',
    flex: 1,
  },
  clearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  clearBtnText: {
    fontSize: 10,
    color: '#888',
  },
  mainMessage: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2A2A',
  },
  mainMessageText: {
    fontSize: 13,
    color: '#C0C0C0',
    lineHeight: 18,
  },
  messageList: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
  },
  messageText: {
    fontSize: 12,
    color: '#A0A0A0',
    flex: 1,
    lineHeight: 16,
  },
  dismissBtn: {
    padding: 2,
    marginTop: 1,
  },
  coverageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#2A2A2A',
  },
  coverageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coverageText: {
    fontSize: 10,
    color: '#888',
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  compactText: {
    fontSize: 12,
    color: '#A0A0A0',
    flex: 1,
  },
});




