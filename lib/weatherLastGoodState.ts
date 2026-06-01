export interface WeatherLastGoodDecision<T> {
  value: T | null;
  lastGood: T | null;
  retainedLastGood: boolean;
  ignoredEmptyUpdate: boolean;
  clearedExplicitly: boolean;
}

export function resolveWeatherLastGoodUpdate<T>(
  incoming: T | null | undefined,
  lastGood: T | null | undefined,
  hasUsableIncoming: boolean,
  options?: { explicitClear?: boolean },
): WeatherLastGoodDecision<T> {
  if (options?.explicitClear) {
    return {
      value: null,
      lastGood: null,
      retainedLastGood: false,
      ignoredEmptyUpdate: false,
      clearedExplicitly: true,
    };
  }

  if (hasUsableIncoming && incoming != null) {
    return {
      value: incoming,
      lastGood: incoming,
      retainedLastGood: false,
      ignoredEmptyUpdate: false,
      clearedExplicitly: false,
    };
  }

  if (lastGood != null) {
    return {
      value: lastGood,
      lastGood,
      retainedLastGood: true,
      ignoredEmptyUpdate: true,
      clearedExplicitly: false,
    };
  }

  return {
    value: incoming ?? null,
    lastGood: null,
    retainedLastGood: false,
    ignoredEmptyUpdate: incoming == null,
    clearedExplicitly: false,
  };
}
