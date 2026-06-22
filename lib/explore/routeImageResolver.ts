import {
  getExploreRouteThumbnail,
  type ExploreRouteThumbnailRoute,
} from '../exploreTrailThumbnails';

export type RouteCardImageSource =
  | 'cached_thumbnail'
  | 'remote_thumbnail'
  | 'uploaded_user_image_thumbnail'
  | 'generated_category_fallback'
  | 'neutral_ecs_fallback';

export type RouteImageCandidate = {
  routeId: string;
  title?: string | null;
  cachedThumbnailUri?: string | null;
  remoteThumbnailUri?: string | null;
  uploadedImageThumbnailUri?: string | null;
  route?: ExploreRouteThumbnailRoute | null;
  imageCache?: RouteImageMemoryCache | null;
  allowGeneratedFallback?: boolean;
};

export type ResolvedRouteCardImage = {
  uri: string;
  source: RouteCardImageSource;
  sourceKey: string | null;
  trust: 'trusted' | 'acceptable' | 'fallback';
  blocksCardRender: false;
  textAndMetadataFirst: true;
  placeholderVisible: true;
};

export type RouteImagePrefetchPlan = {
  uris: string[];
  visibleCount: number;
  prefetchCount: number;
  offscreenImageDeferral: true;
  textAndMetadataFirst: true;
};

export type RouteImageMemoryCache = {
  loadedByRouteId: Map<string, string>;
  loadedUris: Set<string>;
  failedUris: Set<string>;
  pendingUris: Set<string>;
  getLoadedRouteUri: (routeId: string | null | undefined) => string | null;
  markLoaded: (routeIdOrUri: string | null | undefined, uri?: string | null) => void;
  markFailed: (uri: string | null | undefined) => void;
  markPending: (uri: string | null | undefined) => void;
  status: (uri: string | null | undefined) => 'loaded' | 'failed' | 'pending' | 'missing';
  clear: () => void;
};

export const ECS_ROUTE_IMAGE_NEUTRAL_FALLBACK_URI = 'ecs://route-card-neutral-fallback';

function cleanUri(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUsableUri(uri: string | null, cache?: RouteImageMemoryCache | null): uri is string {
  if (!uri) return false;
  return cache?.status(uri) !== 'failed';
}

function resolved(
  uri: string,
  source: RouteCardImageSource,
  trust: ResolvedRouteCardImage['trust'],
  sourceKey: string | null = null,
): ResolvedRouteCardImage {
  return {
    uri,
    source,
    sourceKey,
    trust,
    blocksCardRender: false,
    textAndMetadataFirst: true,
    placeholderVisible: true,
  };
}

export function createRouteImageMemoryCache(): RouteImageMemoryCache {
  const loadedByRouteId = new Map<string, string>();
  const loadedUris = new Set<string>();
  const failedUris = new Set<string>();
  const pendingUris = new Set<string>();

  return {
    loadedByRouteId,
    loadedUris,
    failedUris,
    pendingUris,
    getLoadedRouteUri(routeId) {
      const key = String(routeId ?? '').trim();
      if (!key) return null;
      return loadedByRouteId.get(key) ?? null;
    },
    markLoaded(routeIdOrUri, uri) {
      const primary = cleanUri(routeIdOrUri);
      const loadedUri = cleanUri(uri) ?? primary;
      if (!loadedUri) return;
      loadedUris.add(loadedUri);
      failedUris.delete(loadedUri);
      pendingUris.delete(loadedUri);
      if (primary && uri) {
        loadedByRouteId.set(primary, loadedUri);
      }
    },
    markFailed(uri) {
      const clean = cleanUri(uri);
      if (!clean) return;
      failedUris.add(clean);
      pendingUris.delete(clean);
    },
    markPending(uri) {
      const clean = cleanUri(uri);
      if (!clean || loadedUris.has(clean) || failedUris.has(clean)) return;
      pendingUris.add(clean);
    },
    status(uri) {
      const clean = cleanUri(uri);
      if (!clean) return 'missing';
      if (loadedUris.has(clean)) return 'loaded';
      if (failedUris.has(clean)) return 'failed';
      if (pendingUris.has(clean)) return 'pending';
      return 'missing';
    },
    clear() {
      loadedByRouteId.clear();
      loadedUris.clear();
      failedUris.clear();
      pendingUris.clear();
    },
  };
}

function routeForFallback(input: RouteImageCandidate): ExploreRouteThumbnailRoute {
  return {
    ...(input.route ?? {}),
    id: input.route?.id ?? input.routeId,
    name: input.route?.name ?? input.title ?? input.routeId,
  };
}

export function resolveRouteCardImage(input: RouteImageCandidate): ResolvedRouteCardImage {
  const imageCache = input.imageCache ?? null;
  const cachedRouteUri = cleanUri(imageCache?.getLoadedRouteUri(input.routeId));
  if (isUsableUri(cachedRouteUri, imageCache)) {
    return resolved(cachedRouteUri, 'cached_thumbnail', 'trusted');
  }

  const cachedThumbnailUri = cleanUri(input.cachedThumbnailUri);
  if (isUsableUri(cachedThumbnailUri, imageCache)) {
    return resolved(cachedThumbnailUri, 'cached_thumbnail', 'trusted');
  }

  const remoteThumbnailUri = cleanUri(input.remoteThumbnailUri);
  if (isUsableUri(remoteThumbnailUri, imageCache)) {
    return resolved(remoteThumbnailUri, 'remote_thumbnail', 'trusted');
  }

  const uploadedImageThumbnailUri = cleanUri(input.uploadedImageThumbnailUri);
  if (isUsableUri(uploadedImageThumbnailUri, imageCache)) {
    return resolved(uploadedImageThumbnailUri, 'uploaded_user_image_thumbnail', 'trusted');
  }

  if (input.allowGeneratedFallback !== false) {
    const assignment = getExploreRouteThumbnail(routeForFallback(input));
    if (isUsableUri(assignment.uri, imageCache)) {
      return resolved(
        assignment.uri,
        'generated_category_fallback',
        assignment.trust === 'trusted' ? 'trusted' : 'acceptable',
        assignment.sourceKey ?? null,
      );
    }
  }

  return resolved(ECS_ROUTE_IMAGE_NEUTRAL_FALLBACK_URI, 'neutral_ecs_fallback', 'fallback');
}

export function buildRouteImagePrefetchQueue(
  routes: RouteImageCandidate[],
  options: {
    imageCache?: RouteImageMemoryCache | null;
    visibleCount: number;
    prefetchCount: number;
  },
): RouteImagePrefetchPlan {
  const imageCache = options.imageCache ?? null;
  const visibleCount = Math.max(0, Math.round(options.visibleCount));
  const prefetchCount = Math.max(0, Math.round(options.prefetchCount));
  const uris: string[] = [];
  const seen = new Set<string>();

  for (const route of routes.slice(visibleCount)) {
    if (uris.length >= prefetchCount) break;
    const candidate = resolveRouteCardImage({
      ...route,
      imageCache,
      allowGeneratedFallback: false,
    });
    if (
      candidate.source === 'neutral_ecs_fallback' ||
      !candidate.uri ||
      seen.has(candidate.uri) ||
      imageCache?.status(candidate.uri) === 'loaded' ||
      imageCache?.status(candidate.uri) === 'failed'
    ) {
      continue;
    }
    seen.add(candidate.uri);
    uris.push(candidate.uri);
  }

  return {
    uris,
    visibleCount,
    prefetchCount,
    offscreenImageDeferral: true,
    textAndMetadataFirst: true,
  };
}

export const routeCardImageCache = createRouteImageMemoryCache();
