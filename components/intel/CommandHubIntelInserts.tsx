import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { useApp } from '../../context/AppContext';
import { getBuilderState, getCachedExpeditions } from '../../lib/expeditionCache';
import type { EcsExpedition } from '../../lib/expeditionTypes';
import { routeStore, type ImportedRoute } from '../../lib/routeStore';
import { calculateRisk, getPackingStats, getRiskColor } from '../../lib/calculations';
import DocumentPreviewModal from './DocumentPreviewModal';
import IntelInsertTabs from './IntelInsertTabs';

export default function CommandHubIntelInserts() {
  const {
    activeTrip,
    loadItems,
    riskScore,
    refreshActiveTrip,
    showToast,
  } = useApp();
  const [builderState, setBuilderState] = useState(() => getBuilderState());
  const [activeRoute, setActiveRoute] = useState<ImportedRoute | null>(() => routeStore.getActive());
  const [expeditions, setExpeditions] = useState<EcsExpedition[]>(() => getCachedExpeditions());
  const [docPreviewVisible, setDocPreviewVisible] = useState(false);
  const [docPreviewId, setDocPreviewId] = useState('');
  const [docPreviewTitle, setDocPreviewTitle] = useState('');
  const [docPreviewCategory, setDocPreviewCategory] = useState<'system' | 'operational'>('system');
  const [docPreviewContent, setDocPreviewContent] = useState<string | undefined>(undefined);

  useEffect(() => {
    refreshActiveTrip();
    setBuilderState(getBuilderState());
    setActiveRoute(routeStore.getActive());
    setExpeditions(getCachedExpeditions());
  }, [refreshActiveTrip]);

  const risk = useMemo(() => {
    if (riskScore) {
      return calculateRisk(riskScore);
    }
    return { score: 0, level: 'N/A' as any };
  }, [riskScore]);

  const loadoutStats = useMemo(() => {
    if (activeTrip) {
      return getPackingStats(loadItems, activeTrip.active_mode || 'Trip');
    }
    return { totalActive: 0, packedActive: 0, pct: 0 };
  }, [activeTrip, loadItems]);

  const handleViewDocument = useCallback((
    id: string,
    title: string,
    category: 'system' | 'operational',
    content?: string,
  ) => {
    setDocPreviewId(id);
    setDocPreviewTitle(title);
    setDocPreviewCategory(category);
    setDocPreviewContent(content);
    setDocPreviewVisible(true);
  }, []);

  const handleCloseDocPreview = useCallback(() => {
    setDocPreviewVisible(false);
  }, []);

  const handleExportContent = useCallback((content: string, filename?: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename || 'ecs-export'}-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('DOCUMENT EXPORTED');
      return;
    }

    showToast('Export available on web');
  }, [showToast]);

  return (
    <View style={styles.container}>
      <IntelInsertTabs
        builderState={builderState}
        activeRoute={activeRoute}
        loadoutStats={loadoutStats}
        onViewDocument={handleViewDocument}
        onExportDocument={handleExportContent}
        onToast={showToast}
        riskScore={riskScore ? risk.score : null}
        riskLevel={risk.level}
        riskColor={getRiskColor(risk.level)}
        expeditions={expeditions}
      />

      <DocumentPreviewModal
        visible={docPreviewVisible}
        onClose={handleCloseDocPreview}
        documentId={docPreviewId}
        documentTitle={docPreviewTitle}
        documentCategory={docPreviewCategory}
        customContent={docPreviewContent}
        onExport={(content) => handleExportContent(content, `ecs-${docPreviewId}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: -16,
  },
});
