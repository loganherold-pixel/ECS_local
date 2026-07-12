export type LiveSmartResupplyPoiCategory = 'fuel' | 'food_supplies';

export type LiveSmartResupplyPoiLike = {
  title?: unknown;
  subtitle?: unknown;
  raw?: unknown;
};

const STREET_TITLE_PATTERN =
  /\b(?:street|st|road|rd|drive|dr|lane|ln|avenue|ave|boulevard|blvd|highway|hwy|way|court|ct|circle|cir|route|parkway|pkwy|trail)\.?$/i;

const FUEL_POI_SIGNAL_PATTERN =
  /\b(?:gas station|fuel stop|fuel station|service station|truck stop|travel center|convenience store|shell|chevron|conoco|sinclair|maverik|circle k|kum\s*&\s*go|exxon|mobil|bp|texaco|valero|phillips 66|love'?s|pilot|flying j|petro|speedway|casey's|76)\b/i;

const GROCERY_POI_SIGNAL_PATTERN =
  /\b(?:grocery|grocer|supermarket|market|foods|general store|safeway|kroger|king soopers|city market|walmart|target|costco|sam'?s club|winco|albertsons|whole foods|trader joe'?s|dollar general|family dollar)\b/i;

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function rawText(value: unknown): string {
  try {
    return value ? JSON.stringify(value).slice(0, 3000) : '';
  } catch {
    return '';
  }
}

function searchableText(values: LiveSmartResupplyPoiLike[]): string {
  return values
    .flatMap((value) => [
      textValue(value.title),
      textValue(value.subtitle),
      rawText(value.raw),
    ])
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

function titleLooksLikeStreet(values: LiveSmartResupplyPoiLike[]): boolean {
  return values
    .map((value) => textValue(value.title))
    .filter(Boolean)
    .some((title) => STREET_TITLE_PATTERN.test(title));
}

function hasCategorySignal(text: string, category: LiveSmartResupplyPoiCategory): boolean {
  return category === 'fuel'
    ? FUEL_POI_SIGNAL_PATTERN.test(text)
    : GROCERY_POI_SIGNAL_PATTERN.test(text);
}

export function isLiveSmartResupplyPoiCandidate(args: {
  category: LiveSmartResupplyPoiCategory;
  suggestion: LiveSmartResupplyPoiLike;
  destination: LiveSmartResupplyPoiLike;
}): boolean {
  const text = searchableText([args.suggestion, args.destination]);
  if (!hasCategorySignal(text, args.category)) return false;
  if (titleLooksLikeStreet([args.suggestion, args.destination])) return false;
  return true;
}
