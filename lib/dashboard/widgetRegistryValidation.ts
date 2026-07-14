export type DashboardWidgetValidationIssueCode =
  | 'duplicate_registry_id'
  | 'duplicate_catalog_id'
  | 'missing_registry_entry'
  | 'missing_catalog_entry'
  | 'invalid_supported_sizes'
  | 'invalid_recommended_size'
  | 'missing_source_contract'
  | 'missing_fallback_state'
  | 'missing_detail_view'
  | 'invalid_profile_compatibility'
  | 'invalid_default_mode'
  | 'invalid_runtime_status'
  | 'invalid_default_layout';

export type DashboardWidgetValidationIssue = {
  code: DashboardWidgetValidationIssueCode;
  widgetId: string | null;
  message: string;
};

export type DashboardWidgetValidationResult = {
  valid: boolean;
  issues: DashboardWidgetValidationIssue[];
  registryCount: number;
  catalogCount: number;
  pickerCount: number;
};

export type DashboardWidgetRegistryLike = {
  widget_id: string;
  default_size: string;
  render_ready: boolean;
  widget_status: string;
};

export type DashboardWidgetCatalogLike = {
  widgetId: string;
  supportedWidgetSizes: readonly string[];
  recommendedWidgetSize: string;
  minimumWidgetSize: string;
  supportedModes: readonly string[];
  defaultModes: readonly string[];
  tabEligibility: 'expedition' | 'highway' | 'both';
  liveData: boolean;
  liveSources: readonly string[];
  fallbackBehavior: string;
  detailView?: string;
  pickerEnabled: boolean;
};

export type DashboardDefaultLayoutLike = Record<
  string,
  { slots: ReadonlyArray<{ widgetId: string; widgetSize: string }> }
>;

function duplicateIds(ids: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return duplicates;
}

export function validateDashboardWidgetContracts(input: {
  registry: readonly DashboardWidgetRegistryLike[];
  catalog: readonly DashboardWidgetCatalogLike[];
  defaultLayouts: DashboardDefaultLayoutLike;
}): DashboardWidgetValidationResult {
  const issues: DashboardWidgetValidationIssue[] = [];
  const registryIds = input.registry.map((entry) => entry.widget_id);
  const catalogIds = input.catalog.map((entry) => entry.widgetId);
  const registryById = new Map(input.registry.map((entry) => [entry.widget_id, entry]));
  const catalogById = new Map(input.catalog.map((entry) => [entry.widgetId, entry]));

  for (const widgetId of duplicateIds(registryIds)) {
    issues.push({ code: 'duplicate_registry_id', widgetId, message: `Duplicate registry widget ID: ${widgetId}.` });
  }
  for (const widgetId of duplicateIds(catalogIds)) {
    issues.push({ code: 'duplicate_catalog_id', widgetId, message: `Duplicate dashboard catalog widget ID: ${widgetId}.` });
  }

  for (const entry of input.catalog) {
    const registryEntry = registryById.get(entry.widgetId);
    if (!registryEntry) {
      issues.push({ code: 'missing_registry_entry', widgetId: entry.widgetId, message: 'Catalog widget is not registered.' });
      continue;
    }

    if (entry.supportedWidgetSizes.length === 0 || !entry.supportedWidgetSizes.includes(entry.minimumWidgetSize)) {
      issues.push({ code: 'invalid_supported_sizes', widgetId: entry.widgetId, message: 'Supported sizes must include the minimum size.' });
    }
    if (!entry.supportedWidgetSizes.includes(entry.recommendedWidgetSize)) {
      issues.push({ code: 'invalid_recommended_size', widgetId: entry.widgetId, message: 'Recommended size must be supported.' });
    }
    if (entry.liveData && entry.liveSources.filter(Boolean).length === 0) {
      issues.push({ code: 'missing_source_contract', widgetId: entry.widgetId, message: 'Live widget must declare at least one source.' });
    }
    if (!entry.fallbackBehavior.trim()) {
      issues.push({ code: 'missing_fallback_state', widgetId: entry.widgetId, message: 'Widget must declare degraded or unavailable behavior.' });
    }
    if (entry.pickerEnabled && !entry.detailView?.trim()) {
      issues.push({ code: 'missing_detail_view', widgetId: entry.widgetId, message: 'Picker widget must declare its detail-view behavior.' });
    }
    if (entry.supportedModes.length === 0) {
      issues.push({ code: 'invalid_profile_compatibility', widgetId: entry.widgetId, message: 'Widget must support at least one dashboard mode.' });
    }
    if (entry.tabEligibility === 'expedition' && entry.supportedModes.includes('highway')) {
      issues.push({ code: 'invalid_profile_compatibility', widgetId: entry.widgetId, message: 'Expedition-only widget cannot advertise highway support.' });
    }
    if (entry.tabEligibility === 'highway' && entry.supportedModes.includes('expedition')) {
      issues.push({ code: 'invalid_profile_compatibility', widgetId: entry.widgetId, message: 'Highway-only widget cannot advertise expedition support.' });
    }
    for (const mode of entry.defaultModes) {
      if (!entry.supportedModes.includes(mode)) {
        issues.push({ code: 'invalid_default_mode', widgetId: entry.widgetId, message: `Default mode ${mode} is not supported.` });
      }
    }
    if (!registryEntry.render_ready && registryEntry.widget_status !== 'unavailable') {
      issues.push({ code: 'invalid_runtime_status', widgetId: entry.widgetId, message: 'Non-render-ready widget must be unavailable.' });
    }
  }

  for (const [mode, layout] of Object.entries(input.defaultLayouts)) {
    for (const slot of layout.slots) {
      const catalogEntry = catalogById.get(slot.widgetId);
      if (!catalogEntry || !catalogEntry.supportedModes.includes(mode) || !catalogEntry.supportedWidgetSizes.includes(slot.widgetSize)) {
        issues.push({
          code: 'invalid_default_layout',
          widgetId: slot.widgetId,
          message: `Default ${mode} layout uses an unavailable mode or size.`,
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    registryCount: input.registry.length,
    catalogCount: input.catalog.length,
    pickerCount: input.catalog.filter((entry) => entry.pickerEnabled).length,
  };
}
