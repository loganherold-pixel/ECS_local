import { Platform } from 'react-native';

export interface EcsProStoreProduct {
  productId: string;
  title: string;
  description?: string | null;
  priceLabel: string;
  currencyCode?: string | null;
  subscriptionPeriod?: string | null;
  platform: 'ios' | 'android';
}

export interface NativePurchaseProof {
  platform: 'ios' | 'android';
  productId: string;
  receiptData?: string | null;
  purchaseToken?: string | null;
  packageName?: string | null;
  subscriptionId?: string | null;
  raw: any;
}

export type NativePurchaseState = 'purchased' | 'pending' | 'cancelled';

export interface NativePurchaseResult {
  state: NativePurchaseState;
  proof?: NativePurchaseProof;
  message?: string;
}

const IOS_PRODUCT_ID =
  process.env.EXPO_PUBLIC_ECS_PRO_MONTHLY_IOS_PRODUCT_ID ||
  'com.expeditioncommand.ecs.pro.monthly';
const ANDROID_PRODUCT_ID =
  process.env.EXPO_PUBLIC_ECS_PRO_MONTHLY_ANDROID_PRODUCT_ID ||
  'com.expeditioncommand.ecs.pro.monthly';
const ANDROID_PACKAGE_NAME =
  process.env.EXPO_PUBLIC_ECS_ANDROID_PACKAGE_NAME ||
  'com.expeditioncommand.ecs';

function getRequire(): ((name: string) => any) | null {
  try {
    return (0, eval)('require');
  } catch {
    return null;
  }
}

function loadIapModule(): any | null {
  const req = getRequire();
  if (!req) return null;
  try {
    return req('react-native-iap');
  } catch {
    return null;
  }
}

export function isNativePurchaseModuleAvailable(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return false;
  }
  return loadIapModule() != null;
}

async function initConnection(iap: any) {
  if (typeof iap.initConnection === 'function') {
    await iap.initConnection();
  }
}

async function endConnection(iap: any) {
  if (typeof iap.endConnection === 'function') {
    try {
      await iap.endConnection();
    } catch {}
  }
}

async function withConnection<T>(task: (iap: any) => Promise<T>): Promise<T> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Native purchases are only available in iOS and Android builds.');
  }

  const iap = loadIapModule();
  if (!iap) {
    throw new Error('Native purchase module is unavailable in this build.');
  }

  await initConnection(iap);
  try {
    return await task(iap);
  } finally {
    await endConnection(iap);
  }
}

export function getEcsProMonthlyProductId(): string {
  return Platform.OS === 'ios' ? IOS_PRODUCT_ID : ANDROID_PRODUCT_ID;
}

function normalizeProduct(product: any): EcsProStoreProduct {
  return {
    productId: String(product?.productId || product?.productIdAndroid || product?.productIdIOS || getEcsProMonthlyProductId()),
    title: String(product?.title || 'ECS Pro Monthly'),
    description: product?.description || null,
    priceLabel: String(
      product?.localizedPrice ||
      product?.displayPrice ||
      product?.priceString ||
      product?.price ||
      '$0.00'
    ),
    currencyCode: product?.currency || product?.currencyCode || null,
    subscriptionPeriod:
      product?.subscriptionPeriodAndroid ||
      product?.subscriptionPeriodUnitIOS ||
      product?.subscriptionPeriodNumberIOS ||
      null,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

function flattenPurchaseResult(result: any): any | null {
  if (!result) return null;
  if (Array.isArray(result)) return result[0] || null;
  if (Array.isArray(result?.purchase)) return result.purchase[0] || null;
  return result;
}

function normalizePurchaseProof(purchase: any): NativePurchaseProof | null {
  const productId = purchase?.productId || purchase?.productIds?.[0] || getEcsProMonthlyProductId();
  if (!productId) return null;

  if (Platform.OS === 'ios') {
    const receiptData =
      purchase?.transactionReceipt ||
      purchase?.transactionReceiptIOS ||
      purchase?.originalJson ||
      null;
    if (!receiptData) return null;
    return {
      platform: 'ios',
      productId,
      receiptData,
      subscriptionId: productId,
      raw: purchase,
    };
  }

  const purchaseToken =
    purchase?.purchaseToken ||
    purchase?.purchaseTokenAndroid ||
    null;
  if (!purchaseToken) return null;

  return {
    platform: 'android',
    productId,
    purchaseToken,
    packageName: purchase?.packageName || ANDROID_PACKAGE_NAME,
    subscriptionId: productId,
    raw: purchase,
  };
}

function isCancelledPurchaseError(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    code === 'E_USER_CANCELLED' ||
    code === '1' ||
    message.includes('cancel') ||
    message.includes('user cancelled')
  );
}

export async function loadEcsProStoreProduct(): Promise<EcsProStoreProduct> {
  return withConnection(async (iap) => {
    const sku = getEcsProMonthlyProductId();
    const getSubscriptions = iap.getSubscriptions;
    if (typeof getSubscriptions !== 'function') {
      throw new Error('Store product lookup is unavailable in this build.');
    }

    const result = await getSubscriptions.call(iap, { skus: [sku] }).catch(async () => {
      return getSubscriptions.call(iap, [sku]);
    });
    const product = Array.isArray(result) ? result[0] : result?.[0];
    if (!product) {
      throw new Error('ECS Pro Monthly is unavailable from the store right now.');
    }
    return normalizeProduct(product);
  });
}

export async function startEcsProMonthlyPurchase(): Promise<NativePurchaseResult> {
  return withConnection(async (iap) => {
    const sku = getEcsProMonthlyProductId();
    try {
      const requestSubscription = iap.requestSubscription;
      if (typeof requestSubscription !== 'function') {
        throw new Error('Subscription purchases are unavailable in this build.');
      }

      const purchaseResult = await requestSubscription.call(
        iap,
        Platform.OS === 'android'
          ? { sku, subscriptionOffers: [] }
          : { sku },
      ).catch(async () => {
        return requestSubscription.call(iap, sku);
      });

      const purchase = flattenPurchaseResult(purchaseResult);
      if (!purchase) {
        return {
          state: 'pending',
          message: 'Purchase is pending confirmation from the store.',
        };
      }

      const proof = normalizePurchaseProof(purchase);
      if (!proof) {
        return {
          state: 'pending',
          message: 'Purchase completed, but the receipt is still pending.',
        };
      }

      return { state: 'purchased', proof };
    } catch (error: any) {
      if (isCancelledPurchaseError(error)) {
        return { state: 'cancelled', message: 'Purchase cancelled.' };
      }
      throw error;
    }
  });
}

export async function restoreEcsProPurchase(): Promise<NativePurchaseResult> {
  return withConnection(async (iap) => {
    const getAvailablePurchases = iap.getAvailablePurchases;
    if (typeof getAvailablePurchases !== 'function') {
      throw new Error('Restore purchases is unavailable in this build.');
    }

    const purchases = await getAvailablePurchases.call(iap);
    const sku = getEcsProMonthlyProductId();
    const matched = Array.isArray(purchases)
      ? purchases.find((purchase: any) => {
          const productId = purchase?.productId || purchase?.productIds?.[0];
          return productId === sku;
        })
      : null;

    if (!matched) {
      return {
        state: 'pending',
        message: 'No prior ECS Pro Monthly purchase was found for this store account.',
      };
    }

    const proof = normalizePurchaseProof(matched);
    if (!proof) {
      return {
        state: 'pending',
        message: 'A prior purchase was found, but the restore proof is incomplete.',
      };
    }

    return { state: 'purchased', proof };
  });
}

export async function finishEcsProNativePurchase(proof: NativePurchaseProof): Promise<void> {
  await withConnection(async (iap) => {
    const finishTransaction = iap.finishTransaction;
    if (typeof finishTransaction !== 'function') return;

    try {
      await finishTransaction.call(
        iap,
        Platform.OS === 'ios'
          ? { purchase: proof.raw, isConsumable: false }
          : { purchase: proof.raw, isConsumable: false },
      );
    } catch {
      try {
        await finishTransaction.call(iap, proof.raw, false);
      } catch {}
    }
  });
}
