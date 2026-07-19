export type LiveSmartResupplyPoiCategory = 'fuel' | 'food_supplies';

export type LiveSmartResupplyPoiLike = {
  title?: unknown;
  subtitle?: unknown;
  raw?: unknown;
};

export type LiveSmartResupplyPoiUsefulness =
  | 'combined'
  | 'category_specific'
  | 'convenience_only';

export type LiveSmartResupplyPoiClassification = {
  categoryCoverage: LiveSmartResupplyPoiCategory[];
  usefulness: LiveSmartResupplyPoiUsefulness;
  convenienceOnly: boolean;
};

const STREET_TITLE_PATTERN =
  /\b(?:street|st|road|rd|drive|dr|lane|ln|avenue|ave|boulevard|blvd|highway|hwy|way|court|ct|circle|cir|route|parkway|pkwy|trail)\.?$/i;

const RAW_CLASSIFICATION_KEY_PATTERN =
  /(?:category|categories|classification|maki|place[_-]?type|feature[_-]?type)/i;

const ADDRESS_FEATURE_PATTERN = /\b(?:address|street address)\b/i;

const FUEL_CATEGORY_SIGNAL_PATTERN =
  /\b(?:gas(?:oline)? station|petrol station|fuel station|fuel stop|service station|truck stop|travel (?:center|centre)|automotive fuel)\b/i;

const FUEL_DISPLAY_SIGNAL_PATTERN =
  /\b(?:gas(?:oline)? station|petrol station|fuel station|fuel stop|service station|truck stop|travel (?:center|centre)|diesel|shell|chevron|conoco|sinclair|exxon|mobil|bp|texaco|valero|phillips 66|love'?s|pilot|flying j|petro|speedway|76)\b/i;

const EXPLICIT_COMBUSTION_FUEL_PATTERN =
  /\b(?:gas(?:oline)? station|petrol station|fuel station|fuel stop|service station|truck stop|travel (?:center|centre)|diesel)\b/i;

const GROCERY_CATEGORY_SIGNAL_PATTERN =
  /\b(?:grocery|grocery store|grocer|supermarket|food market|warehouse club)\b/i;

const GROCERY_DISPLAY_SIGNAL_PATTERN =
  /\b(?:grocery|grocer|supermarket|market|foods|safeway|kroger|king soopers|city market|walmart|costco|sam'?s club|winco|albertsons|whole foods|trader joe'?s)\b/i;

const GENERAL_STORE_SIGNAL_PATTERN =
  /\b(?:general store|variety store|dollar store|dollar general|family dollar)\b/i;

const CONVENIENCE_STORE_SIGNAL_PATTERN =
  /\b(?:convenience store|mini ?mart|food mart|corner store|7[ -]?eleven|circle k|casey'?s|wawa|sheetz|maverik|kum\s*&\s*go)\b/i;

const RESTAURANT_SIGNAL_PATTERN =
  /\b(?:restaurant|cafe|coffee shop|coffeehouse|bar|pub|grill|diner|fast food|food service)\b/i;

const LODGING_SIGNAL_PATTERN =
  /\b(?:lodging|hotel|motel|resort|hostel|inn|bed and breakfast)\b/i;

const TRAIL_FACILITY_SIGNAL_PATTERN =
  /\b(?:trailhead|trail facility|hiking trail|visitor center|ranger station|campground|camp site|picnic area)\b/i;

const PARKING_SIGNAL_PATTERN =
  /\b(?:parking|parking lot|parking garage|park and ride)\b/i;

const EV_CHARGING_SIGNAL_PATTERN =
  /\b(?:electric vehicle charging|electric charging|ev charging|ev charger|charging station|charging point|supercharger)\b/i;

const UNRELATED_RETAIL_SIGNAL_PATTERN =
  /\b(?:clothing|apparel|shoe store|furniture|electronics|jewelry|beauty supply|salon|gift shop|souvenir|bookstore|shopping mall|auto parts|car dealer)\b/i;

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedText(values: string[]): string {
  return values
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayText(values: LiveSmartResupplyPoiLike[]): string {
  return normalizedText(values.flatMap((value) => [
    textValue(value.title),
    textValue(value.subtitle),
  ]));
}

function titleText(values: LiveSmartResupplyPoiLike[]): string {
  return normalizedText(values.map((value) => textValue(value.title)));
}

function collectScalarText(value: unknown, output: string[], depth: number): void {
  if (depth > 6 || value == null) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectScalarText(item, output, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>)
      .forEach((item) => collectScalarText(item, output, depth + 1));
  }
}

function collectRawClassificationText(value: unknown, output: string[], depth = 0): void {
  if (depth > 6 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectRawClassificationText(item, output, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (RAW_CLASSIFICATION_KEY_PATTERN.test(key)) {
      collectScalarText(item, output, depth + 1);
    }
    if (item && typeof item === 'object') {
      collectRawClassificationText(item, output, depth + 1);
    }
  });
}

function rawClassificationText(values: LiveSmartResupplyPoiLike[]): string {
  const output: string[] = [];
  values.forEach((value) => collectRawClassificationText(value.raw, output));
  return normalizedText(output);
}

function titleLooksLikeStreet(values: LiveSmartResupplyPoiLike[]): boolean {
  return values
    .map((value) => textValue(value.title))
    .filter(Boolean)
    .some((title) => STREET_TITLE_PATTERN.test(title));
}

function hasDisallowedPoiSignal(text: string): boolean {
  return RESTAURANT_SIGNAL_PATTERN.test(text) ||
    LODGING_SIGNAL_PATTERN.test(text) ||
    TRAIL_FACILITY_SIGNAL_PATTERN.test(text) ||
    PARKING_SIGNAL_PATTERN.test(text) ||
    EV_CHARGING_SIGNAL_PATTERN.test(text) ||
    UNRELATED_RETAIL_SIGNAL_PATTERN.test(text);
}

/**
 * Classifies provider-backed POIs into the only resource categories Smart
 * Resupply may use. Structured provider categories are preferred over title
 * relevance so a restaurant or parking result named after a market or fuel
 * stop cannot become a recommendation.
 */
export function classifyLiveSmartResupplyPoiCandidate(args: {
  suggestion: LiveSmartResupplyPoiLike;
  destination: LiveSmartResupplyPoiLike;
}): LiveSmartResupplyPoiClassification | null {
  const values = [args.suggestion, args.destination];
  if (titleLooksLikeStreet(values)) return null;

  const providerText = rawClassificationText(values);
  const visibleText = displayText(values);
  const titles = titleText(values);
  if (ADDRESS_FEATURE_PATTERN.test(providerText)) return null;

  const providerFuel = FUEL_CATEGORY_SIGNAL_PATTERN.test(providerText);
  const providerGrocery = GROCERY_CATEGORY_SIGNAL_PATTERN.test(providerText);
  const providerGeneralStore = GENERAL_STORE_SIGNAL_PATTERN.test(providerText);
  const providerConvenienceStore = CONVENIENCE_STORE_SIGNAL_PATTERN.test(providerText);
  const providerHasAllowedCategory = providerFuel ||
    providerGrocery ||
    providerGeneralStore ||
    providerConvenienceStore;
  const providerHasDisallowedCategory = hasDisallowedPoiSignal(providerText);
  const titleHasDisallowedIdentity = hasDisallowedPoiSignal(titles);

  if ((providerHasDisallowedCategory || titleHasDisallowedIdentity) && !providerHasAllowedCategory) {
    return null;
  }

  const allowDisplayEvidence = !providerHasDisallowedCategory && !titleHasDisallowedIdentity;
  const explicitDisplayFuel = EXPLICIT_COMBUSTION_FUEL_PATTERN.test(visibleText);
  let coversFuel = providerFuel || (allowDisplayEvidence && FUEL_DISPLAY_SIGNAL_PATTERN.test(visibleText));
  const hasEvChargingSignal = EV_CHARGING_SIGNAL_PATTERN.test(`${providerText} ${visibleText}`);
  if (hasEvChargingSignal && !providerFuel && !explicitDisplayFuel) coversFuel = false;

  const coversStrongSupplies = providerGrocery ||
    providerGeneralStore ||
    (allowDisplayEvidence && (
      GROCERY_DISPLAY_SIGNAL_PATTERN.test(visibleText) ||
      GENERAL_STORE_SIGNAL_PATTERN.test(visibleText)
    ));
  const coversConvenienceSupplies = providerConvenienceStore ||
    (allowDisplayEvidence && CONVENIENCE_STORE_SIGNAL_PATTERN.test(visibleText));
  const coversSupplies = coversStrongSupplies || coversConvenienceSupplies;
  const convenienceOnly = coversSupplies && !coversStrongSupplies;

  const categoryCoverage: LiveSmartResupplyPoiCategory[] = [];
  if (coversFuel) categoryCoverage.push('fuel');
  if (coversSupplies) categoryCoverage.push('food_supplies');
  if (categoryCoverage.length === 0) return null;

  return {
    categoryCoverage,
    usefulness: coversFuel && coversSupplies && !convenienceOnly
      ? 'combined'
      : convenienceOnly
        ? 'convenience_only'
        : 'category_specific',
    convenienceOnly,
  };
}

export function isLiveSmartResupplyPoiCandidate(args: {
  category: LiveSmartResupplyPoiCategory;
  suggestion: LiveSmartResupplyPoiLike;
  destination: LiveSmartResupplyPoiLike;
}): boolean {
  const classification = classifyLiveSmartResupplyPoiCandidate(args);
  return classification?.categoryCoverage.includes(args.category) ?? false;
}
