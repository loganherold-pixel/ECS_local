import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SafeIcon as Ionicons } from '../components/SafeIcon';
import LoginHeroBackground from '../components/login/LoginHeroBackground';
import AuthStatusBanner from '../components/login/AuthStatusBanner';
import LegalFooter from '../components/legal/LegalFooter';
import PasswordVisibilityToggle from '../components/login/PasswordVisibilityToggle';
import { AUTH_COPY } from '../lib/auth/authCopy';
import {
  offlineCredentialStore,
  type OfflineCredentialStatusSnapshot,
} from '../lib/auth/offlineCredentialStore';
import { maskAuthEmail } from '../lib/auth/authLogRedaction';
import {
  LOGIN_LOGO_ASPECT_RATIO,
  LOGIN_STATUS_INDICATOR_HEIGHT,
  resolveLoginScreenLayout,
} from '../lib/auth/loginScreenLayout';
import { exportLocalData, importDevSmokeLocalData, importLocalData } from '../lib/localDataExport';
import { resolveConfiguredVehiclePresence } from '../lib/vehiclePresence';
import { sessionStore } from '../lib/sessionStore';
import { setupStore } from '../lib/setupStore';
import { vehicleSetupStore } from '../lib/vehicleSetupStore';
import { useReducedMotion } from '../lib/ecsAnimations';
import { ECS, TACTICAL } from '../lib/theme';
import { EASING, MOTION, PRESS } from '../lib/motion';
import { useApp } from '../context/AppContext';

const LOGIN_LOGO = require('../assets/images/Expedition Command System Logo.png');

type ScreenMode = 'login' | 'forgot';
type MessageTone = 'neutral' | 'error' | 'success';

function logAuthDev(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeLoginError(rawError: string | undefined, isOnline: boolean) {
  const normalized = (rawError || '').trim().toLowerCase();
  if (
    normalized.includes('not prepared for offline sign-in') ||
    normalized.includes('offline sign-in for this account has expired')
  ) {
    return rawError || AUTH_COPY.login.offlineNotPrepared;
  }
  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('email and password') ||
    normalized.includes('password not recognized') ||
    normalized.includes('no account found')
  ) return AUTH_COPY.login.invalidCredentials;
  if (normalized.includes('too many requests') || normalized.includes('rate limit') || normalized.includes('too many attempts')) {
    return AUTH_COPY.login.rateLimited;
  }
  if (!isOnline || normalized.includes('offline') || normalized.includes('network')) return AUTH_COPY.login.offline;
  return AUTH_COPY.login.genericFailure;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ reason?: string; mode?: string; email?: string }>();
  const {
    signIn,
    sendPasswordReset,
    isOnline,
    authPhase,
    authNotice,
    consumeAuthNotice,
    enterOfflineMode,
    offlineMode,
    showToast,
  } = useApp();
  const reducedMotion = useReducedMotion();
  const loginLayout = useMemo(
    () => resolveLoginScreenLayout({
      width,
      height,
      safeAreaTop: insets.top,
      safeAreaBottom: insets.bottom,
    }),
    [height, insets.bottom, insets.top, width],
  );
  const layoutMetrics = loginLayout.layoutMetrics;

  const passwordRef = useRef<TextInput>(null);
  const primaryPressScale = useRef(new Animated.Value(1)).current;

  const [mode, setMode] = useState<ScreenMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(() => {
    const prefs = sessionStore.getPreferences();
    return prefs.lastUserId ? prefs.keepSignedIn : true;
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [exportingLocalData, setExportingLocalData] = useState(false);
  const [importingLocalData, setImportingLocalData] = useState(false);
  const [devSeedingLocalData, setDevSeedingLocalData] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<MessageTone>('neutral');
  const [offlineCredentialStatus, setOfflineCredentialStatus] =
    useState<OfflineCredentialStatusSnapshot | null>(null);
  const [pendingFreeDestination, setPendingFreeDestination] = useState<unknown | null>(null);
  const loginCtaRenderedRef = useRef(false);
  const loginSubmitInFlightRef = useRef(false);

  const trimmedEmail = email.trim();
  const trimmedResetEmail = resetEmail.trim();
  const emailError = trimmedEmail && !isValidEmail(trimmedEmail) ? AUTH_COPY.login.invalidEmail : '';
  const passwordError = password ? '' : '';
  const resetEmailError = trimmedResetEmail && !isValidEmail(trimmedResetEmail) ? AUTH_COPY.login.invalidEmail : '';

  const loginGuardState = useMemo(() => {
    const hasEmail = trimmedEmail.length > 0;
    const emailValid = hasEmail && isValidEmail(trimmedEmail);
    const hasPassword = password.trim().length > 0;
    return {
      loading,
      isOnline,
      hasEmail,
      emailValid,
      hasPassword,
      disabled: loading,
    };
  }, [isOnline, loading, password, trimmedEmail]);
  const loginDiagnosticState = useMemo(() => {
    return {
      loading: loginGuardState.loading,
      isOnline: loginGuardState.isOnline,
      hasEmail: loginGuardState.hasEmail,
      emailValid: loginGuardState.emailValid,
      disabled: loginGuardState.disabled,
    };
  }, [loginGuardState]);
  const loginDisabled = loginGuardState.disabled;
  const forgotDisabled = resetLoading || !isOnline || !trimmedResetEmail || !isValidEmail(trimmedResetEmail);
  const utilityBusy = loading || resetLoading || exportingLocalData || importingLocalData || devSeedingLocalData;
  const isDevSmokeSeedEnabled = typeof __DEV__ !== 'undefined' && __DEV__;

  useEffect(() => {
    const notice = consumeAuthNotice();
    if (notice) {
      setStatusMessage(notice);
      setStatusTone('neutral');
      return;
    }
    if (params.reason === 'password-updated') {
      setStatusMessage('Your password has been updated successfully.');
      setStatusTone('success');
      return;
    }
    if (params.reason === 'access-ready') {
      setStatusMessage(AUTH_COPY.activation.successLine);
      setStatusTone('success');
      return;
    }
    if (params.reason === 'signed-out') {
      setStatusMessage('Please sign in again to continue.');
      setStatusTone('neutral');
    }
  }, [authNotice, consumeAuthNotice, params.reason]);

  useEffect(() => {
    if (params.mode === 'forgot') {
      setMode('forgot');
      const seededEmail = typeof params.email === 'string' ? params.email.trim() : '';
      if (seededEmail) setResetEmail(seededEmail);
    }
  }, [params.email, params.mode]);

  useEffect(() => {
    if (isOnline || !trimmedEmail || !isValidEmail(trimmedEmail)) {
      setOfflineCredentialStatus(null);
      return;
    }

    let cancelled = false;
    setOfflineCredentialStatus(null);
    void offlineCredentialStore
      .getOfflineCredentialStatus({ email: trimmedEmail })
      .then((status) => {
        if (!cancelled) {
          setOfflineCredentialStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOfflineCredentialStatus({
            state: 'unprepared',
            reason: 'invalid_record',
            email: null,
            userId: null,
            expiresAtMs: null,
            lastVerifiedOnlineAt: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOnline, trimmedEmail]);

  useEffect(() => {
    if (!statusMessage || Platform.OS === 'web') return;
    AccessibilityInfo.announceForAccessibility?.(statusMessage);
  }, [statusMessage]);

  useEffect(() => {
    if (loginCtaRenderedRef.current) return;
    loginCtaRenderedRef.current = true;
    logAuthDev('[Auth] SignIn CTA rendered');
  }, []);

  const handlePrimaryPressIn = useCallback(() => {
    if (reducedMotion) {
      primaryPressScale.setValue(PRESS.scaleDown);
      return;
    }
    Animated.timing(primaryPressScale, {
      toValue: PRESS.scaleDown,
      duration: MOTION.buttonPressIn,
      easing: EASING.press,
      useNativeDriver: true,
    }).start();
  }, [primaryPressScale, reducedMotion]);

  const handlePrimaryPressOut = useCallback(() => {
    if (reducedMotion) {
      primaryPressScale.setValue(PRESS.scaleUp);
      return;
    }
    Animated.timing(primaryPressScale, {
      toValue: PRESS.scaleUp,
      duration: MOTION.buttonPressOut,
      easing: EASING.press,
      useNativeDriver: true,
    }).start();
  }, [primaryPressScale, reducedMotion]);

  const clearStatus = useCallback(() => {
    setStatusMessage('');
    setStatusTone('neutral');
  }, []);

  const handleCreateAccount = useCallback(() => {
    Keyboard.dismiss();
    setShowPassword(false);
    setPassword('');
    router.push('/initialize');
  }, [router]);

  const handleContinueFree = useCallback(() => {
    Keyboard.dismiss();
    setShowPassword(false);
    setPassword('');
    clearStatus();
    const { hasConfiguredVehicle, localVehicleCount, activeVehicleId, setupVehicleId } =
      resolveConfiguredVehiclePresence();
    const setupComplete = setupStore.isComplete();
    const needsFreshGuestSetup = !hasConfiguredVehicle;

    if (needsFreshGuestSetup) {
      setupStore.reset();
      vehicleSetupStore.clearActiveVehicleId();
    }

    const destination =
      hasConfiguredVehicle && setupComplete
        ? '/dashboard'
        : { pathname: '/setup', params: { mode: 'guest-entry' } };
    logAuthDev('[Auth] Free entry route decision', {
      destination,
      hasConfiguredVehicle,
      localVehicleCount,
      activeVehicleId,
      setupVehicleId,
      setupComplete,
      needsFreshGuestSetup,
    });
    enterOfflineMode();
    if (needsFreshGuestSetup) {
      setPendingFreeDestination(destination);
    }
  }, [clearStatus, enterOfflineMode]);

  useEffect(() => {
    if (!offlineMode || !pendingFreeDestination) return;
    router.replace(pendingFreeDestination as any);
    setPendingFreeDestination(null);
  }, [offlineMode, pendingFreeDestination, router]);

  const handleViewPro = useCallback(() => {
    Keyboard.dismiss();
    logAuthDev('[Auth] Pro entry route decision', { destination: '/pro' });
    router.push('/pro');
  }, [router]);

  const handleExport = useCallback(async () => {
    Keyboard.dismiss();
    setExportingLocalData(true);
    const result = await exportLocalData();
    setExportingLocalData(false);
    if (result.success) {
      showToast(result.totalItems > 0 ? `Exported ${result.totalItems} local items` : 'Local export created');
      return;
    }
    setStatusMessage(result.error || 'Unable to export local data right now.');
    setStatusTone('error');
  }, [showToast]);

  const handleImport = useCallback(async () => {
    Keyboard.dismiss();
    clearStatus();
    setImportingLocalData(true);
    const result = await importLocalData();
    setImportingLocalData(false);

    if (result.canceled) return;

    if (result.success) {
      showToast(result.totalItems > 0 ? `Imported ${result.totalItems} local items` : 'Local data import completed');
      setStatusMessage('Local data restored on this device. Sign in to sync subscribed account data when online.');
      setStatusTone('success');
      return;
    }

    setStatusMessage(result.error || 'Unable to import local data right now.');
    setStatusTone('error');
  }, [clearStatus, showToast]);

  const handleDevSmokeSeed = useCallback(async () => {
    Keyboard.dismiss();
    clearStatus();
    setDevSeedingLocalData(true);
    const result = await importDevSmokeLocalData();
    setDevSeedingLocalData(false);

    if (result.success) {
      showToast(result.totalItems > 0 ? `Loaded smoke seed (${result.totalItems} local items)` : 'Smoke seed loaded');
      setStatusMessage('Smoke local profile loaded for Fleet, Navigate, Dispatch, and readiness QA.');
      setStatusTone('success');
      setPendingFreeDestination('/dashboard');
      enterOfflineMode();
      return;
    }

    setStatusMessage(result.error || 'Unable to load smoke seed right now.');
    setStatusTone('error');
  }, [clearStatus, enterOfflineMode, showToast]);

  const handleOpenAuthInfo = useCallback((sheet: 'terms' | 'privacy' | 'support') => {
    Keyboard.dismiss();
    logAuthDev('[Auth] Legal/support route open', { sheet });
    router.push({ pathname: '/auth-info', params: { sheet } });
  }, [router]);

  const handleLogin = useCallback(async (source: 'cta_press' | 'password_submit' | 'accessibility_activate') => {
    clearStatus();

    if (loginSubmitInFlightRef.current) {
      logAuthDev('[Auth] SignIn CTA blocked by in-flight request', {
        source,
        reason: 'in_flight',
      });
      return;
    }

    logAuthDev('[Auth] SignIn validation start', {
      source,
      ...loginDiagnosticState,
    });

    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      logAuthDev('[Auth] SignIn validation failed', {
        source,
        reason: !trimmedEmail ? 'missing_email' : 'invalid_email',
      });
      setStatusMessage(AUTH_COPY.login.invalidEmail);
      setStatusTone('error');
      return;
    }
    if (!password.trim()) {
      logAuthDev('[Auth] SignIn validation failed', {
        source,
        reason: 'missing_credential',
      });
      setStatusMessage(AUTH_COPY.login.missingPassword);
      setStatusTone('error');
      return;
    }
    logAuthDev('[Auth] SignIn validation passed', {
      source,
      email: maskAuthEmail(trimmedEmail),
      offlineCredentialFallbackAllowed: !isOnline,
    });
    Keyboard.dismiss();
    loginSubmitInFlightRef.current = true;
    setLoading(true);
    const result = await signIn(trimmedEmail, password, keepSignedIn, source);
    loginSubmitInFlightRef.current = false;

    if (result.error) {
      setLoading(false);
      setShowPassword(false);
      setStatusMessage(normalizeLoginError(result.error, isOnline));
      setStatusTone('error');
      return;
    }

    setShowPassword(false);
    setPassword('');
  }, [clearStatus, isOnline, keepSignedIn, loginDiagnosticState, password, signIn, trimmedEmail]);

  const handleLoginSubmit = useCallback((source: 'cta_press' | 'password_submit' | 'accessibility_activate') => {
    logAuthDev('[Auth] SignIn CTA press received', {
      source,
      ...loginDiagnosticState,
    });
    if (loading) {
      logAuthDev('[Auth] SignIn CTA blocked by disabled state', {
        source,
        reason: 'loading',
      });
      return;
    }
    void handleLogin(source);
  }, [handleLogin, loading, loginDiagnosticState]);

  const handleForgotPassword = useCallback(async () => {
    clearStatus();
    if (!trimmedResetEmail || !isValidEmail(trimmedResetEmail)) {
      setStatusMessage(AUTH_COPY.login.invalidEmail);
      setStatusTone('error');
      return;
    }
    if (!isOnline) {
      setStatusMessage(AUTH_COPY.login.offline);
      setStatusTone('neutral');
      return;
    }

    setResetLoading(true);
    const result = await sendPasswordReset(trimmedResetEmail);
    setResetLoading(false);
    if (result.error) {
      setStatusMessage(AUTH_COPY.login.genericFailure);
      setStatusTone('error');
      return;
    }

    setStatusMessage(AUTH_COPY.forgotPassword.success);
    setStatusTone('success');
  }, [clearStatus, isOnline, sendPasswordReset, trimmedResetEmail]);

  const handleTogglePassword = useCallback(() => {
    setShowPassword((current) => !current);
    requestAnimationFrame(() => passwordRef.current?.focus());
  }, []);

  useEffect(() => {
    if (authPhase === 'signed_out' && loading) {
      setLoading(false);
    }
  }, [authPhase, loading]);

  const offlineCredentialBanner = useMemo<{ text: string; tone: MessageTone } | null>(() => {
    if (isOnline) return null;
    if (!trimmedEmail || !isValidEmail(trimmedEmail) || !offlineCredentialStatus) {
      return { text: AUTH_COPY.login.offline, tone: 'neutral' };
    }

    if (offlineCredentialStatus.state === 'prepared') {
      return { text: AUTH_COPY.login.offlinePrepared, tone: 'neutral' };
    }

    if (offlineCredentialStatus.state === 'stale') {
      return { text: AUTH_COPY.login.offlineStale, tone: 'error' };
    }

    return { text: AUTH_COPY.login.offlineUnprepared, tone: 'error' };
  }, [isOnline, offlineCredentialStatus, trimmedEmail]);
  const renderMessage = statusMessage
    ? <AuthStatusBanner text={statusMessage} tone={statusTone} />
    : offlineCredentialBanner
      ? <AuthStatusBanner text={offlineCredentialBanner.text} tone={offlineCredentialBanner.tone} />
      : null;
  const footerMarginTop = layoutMetrics.compact ? 4 : Math.max(6, layoutMetrics.footerGap - 12);
  const shellTopPadding = loginLayout.shellTopPadding;
  const shellBottomPadding = loginLayout.shellBottomPadding;
  const authViewportHeight = loginLayout.authViewportHeight;
  const isLandscape = loginLayout.layoutMode === 'landscape_split';
  const loginLogoWidth = loginLayout.logoWidth;
  const loginLogoHeight = loginLayout.logoHeight;
  const loginHeaderHeight = loginLayout.headerHeight;

  return (
    <View style={styles.heroScreen}>
      <LoginHeroBackground />
      <View pointerEvents="none" style={styles.heroGlobalTint} />
      <StatusBar style="light" />
      <View style={styles.heroContentLayer}>
        <View
          style={[
            styles.screenShell,
            {
              paddingTop: shellTopPadding,
              paddingBottom: shellBottomPadding,
              paddingHorizontal: layoutMetrics.horizontalPadding,
            },
          ]}
        >
          <ScrollView
            style={styles.screenTopRegion}
            contentContainerStyle={[
              styles.screenTopContent,
              isLandscape ? styles.screenTopContentLandscape : null,
              { minHeight: authViewportHeight },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View
              style={[
                styles.contentShell,
                isLandscape ? styles.contentShellLandscape : null,
                {
                  maxWidth: loginLayout.contentMaxWidth,
                  gap: loginLayout.contentGap,
                },
              ]}
            >
              <LoginHeaderBlock
                headerHeight={loginHeaderHeight}
                logoWidth={loginLogoWidth}
                logoHeight={loginLogoHeight}
                frameWidth={isLandscape ? Math.max(0, loginLayout.contentMaxWidth - loginLayout.formWidth - loginLayout.contentGap) : undefined}
              />
              {mode === 'login' ? (
                <View style={[styles.formColumn, { width: loginLayout.formWidth }]}>
                  <LoginConnectionStatus
                    isOnline={isOnline}
                    compactLayout={loginLayout.compactLayout}
                  />
                  <LoginCard
                    email={email}
                    emailError={emailError}
                    password={password}
                    passwordError={passwordError}
                    showPassword={showPassword}
                    keepSignedIn={keepSignedIn}
                    loading={loading}
                    utilityBusy={utilityBusy}
                    loginDisabled={loginDisabled}
                    renderMessage={renderMessage}
                    hasMessage={!!renderMessage}
                    primaryPressScale={primaryPressScale}
                    passwordRef={passwordRef}
                    onClearStatus={clearStatus}
                    onSetEmail={setEmail}
                    onSetPassword={setPassword}
                    onSetKeepSignedIn={setKeepSignedIn}
                    onSetMode={setMode}
                    onTogglePassword={handleTogglePassword}
                    onPrimaryPressIn={handlePrimaryPressIn}
                    onPrimaryPressOut={handlePrimaryPressOut}
                    onLoginSubmit={handleLoginSubmit}
                    onContinueFree={handleContinueFree}
                    onViewPro={handleViewPro}
                    onExport={handleExport}
                    onImport={handleImport}
                    onDevSmokeSeed={handleDevSmokeSeed}
                    exportingLocalData={exportingLocalData}
                    importingLocalData={importingLocalData}
                    devSeedingLocalData={devSeedingLocalData}
                    isDevSmokeSeedEnabled={isDevSmokeSeedEnabled}
                    footerMaxWidth={layoutMetrics.footerMaxWidth}
                    compactLayout={loginLayout.compactLayout}
                    cardMaxHeight={loginLayout.formMaxHeight}
                    cardScrollEnabled={loginLayout.cardScrollEnabled}
                    onOpenAuthInfo={handleOpenAuthInfo}
                    onCreateAccount={handleCreateAccount}
                  />
                </View>
              ) : (
                <View style={[styles.formColumn, { width: loginLayout.formWidth }]}>
                  <LoginConnectionStatus
                    isOnline={isOnline}
                    compactLayout={loginLayout.compactLayout}
                  />
                  <ForgotPasswordCard
                    resetEmail={resetEmail}
                    resetEmailError={resetEmailError}
                    resetLoading={resetLoading}
                    forgotDisabled={forgotDisabled}
                    renderMessage={renderMessage}
                    hasMessage={!!renderMessage}
                    primaryPressScale={primaryPressScale}
                    onClearStatus={clearStatus}
                    onSetResetEmail={setResetEmail}
                    onPrimaryPressIn={handlePrimaryPressIn}
                    onPrimaryPressOut={handlePrimaryPressOut}
                    onForgotPassword={handleForgotPassword}
                    onBackToLogin={() => setMode('login')}
                    onCreateAccount={handleCreateAccount}
                    compactLayout={loginLayout.compactLayout}
                    cardMaxHeight={loginLayout.formMaxHeight}
                    cardScrollEnabled={loginLayout.cardScrollEnabled}
                  />
                </View>
              )}
              {mode !== 'login' && !isLandscape ? (
                <LoginFooterBlock
                  footerMaxWidth={layoutMetrics.footerMaxWidth}
                  marginTop={footerMarginTop}
                  onOpenAuthInfo={handleOpenAuthInfo}
                  onCreateAccount={handleCreateAccount}
                  compactLayout={isLandscape}
                />
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heroScreen: { flex: 1, backgroundColor: '#040608' },
  heroGlobalTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,5,8,0.24)',
  },
  heroContentLayer: { ...StyleSheet.absoluteFillObject },
  screenShell: { flex: 1, justifyContent: 'flex-start' },
  screenTopRegion: { flex: 1 },
  screenTopContent: { flexGrow: 1, justifyContent: 'flex-start' },
  screenTopContentLandscape: { justifyContent: 'center' },
  contentShell: { width: '100%', alignSelf: 'center', alignItems: 'center', justifyContent: 'flex-start' },
  contentShellLandscape: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formColumn: { width: '100%', alignItems: 'stretch', justifyContent: 'center' },
  formStatusSlot: {
    minHeight: LOGIN_STATUS_INDICATOR_HEIGHT,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  formStatusSlotLandscape: {
    marginBottom: 6,
  },
  logoFrame: {
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 0,
  },
  logoImage: {
    maxWidth: '100%',
    aspectRatio: LOGIN_LOGO_ASPECT_RATIO,
  },
  onlineRow: {
    alignSelf: 'center',
    minHeight: LOGIN_STATUS_INDICATOR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  onlineText: { color: '#5BCB79', fontSize: 12, lineHeight: 15, fontWeight: '700' },
  offlineText: { color: 'rgba(230,237,243,0.62)' },
  card: {
    width: '100%', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 7, borderRadius: 20,
    backgroundColor: 'rgba(6,9,12,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.32, shadowRadius: 22, elevation: 7,
    marginTop: 2,
  },
  cardCompactLandscape: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 17,
  },
  cardScroll: { width: '100%' },
  cardScrollContent: { flexGrow: 0 },
  fieldBlock: { marginBottom: 6 },
  fieldBlockCompactLandscape: { marginBottom: 4 },
  fieldLabel: { marginBottom: 4, fontSize: 11, lineHeight: 14, fontWeight: '800', color: 'rgba(230,237,243,0.9)', letterSpacing: 1.6 },
  passwordLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  inlineUtilityHit: { minHeight: 24, justifyContent: 'center' },
  inlineUtilityText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: TACTICAL.amber },
  inputShell: {
    minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(12,16,21,0.66)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  inputShellCompactLandscape: { minHeight: 38, borderRadius: 11, paddingHorizontal: 10 },
  input: { flex: 1, fontSize: 15, lineHeight: 20, color: 'rgba(236,239,242,0.95)', paddingVertical: 9, minHeight: 38 },
  inputCompactLandscape: { paddingVertical: 6, minHeight: 32 },
  inlineError: { marginTop: 5, paddingLeft: 2, fontSize: 11, lineHeight: 14, fontWeight: '600', color: '#E2A29A' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28, marginTop: -3, marginBottom: 3 },
  rememberRowCompactLandscape: { minHeight: 24, marginBottom: 1 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(212,160,23,0.78)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: TACTICAL.amber, borderColor: TACTICAL.amber },
  rememberText: { flex: 1, fontSize: 13, lineHeight: 17, color: 'rgba(230,237,243,0.82)', fontWeight: '600' },
  primaryButton: { minHeight: 42, marginTop: 1, borderRadius: 12, backgroundColor: TACTICAL.amber, alignItems: 'center', justifyContent: 'center' },
  primaryButtonCompactLandscape: { minHeight: 36, borderRadius: 11 },
  primaryButtonDisabled: { opacity: 0.46 },
  primaryButtonPressed: { opacity: 0.94, backgroundColor: TACTICAL.amberDark },
  primaryButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryButtonText: { fontSize: 16, lineHeight: 20, fontWeight: '800', color: ECS.bgPrimary, letterSpacing: 0.3 },
  messageRow: { marginTop: 6 },
  messageSlot: { marginTop: 5, minHeight: 28, justifyContent: 'center' },
  messageSlotCollapsed: { marginTop: 2, minHeight: 8 },
  messageSlotCompactLandscape: { marginTop: 3, minHeight: 20 },
  messageSlotCollapsedCompactLandscape: { marginTop: 1, minHeight: 4 },
  orRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 10 },
  orRowCompactLandscape: { marginTop: 3 },
  orRule: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  orText: { color: 'rgba(230,237,243,0.42)', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  actionRow: { marginTop: 5, flexDirection: 'row', gap: 8 },
  actionRowCompactLandscape: { marginTop: 4 },
  secondaryButton: {
    flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(6,8,10,0.28)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10,
  },
  secondaryButtonCompactLandscape: { minHeight: 34, borderRadius: 11, paddingHorizontal: 8 },
  secondaryButtonTextPrimary: { color: TACTICAL.amber, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  secondaryButtonText: { color: 'rgba(236,239,242,0.9)', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  dataTransferRow: { marginTop: 5, flexDirection: 'row', gap: 8 },
  dataTransferRowCompactLandscape: { marginTop: 4 },
  exportButton: {
    flex: 1, minHeight: 34, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.025)',
  },
  exportButtonCompactLandscape: { minHeight: 31, borderRadius: 11, gap: 6, paddingHorizontal: 7 },
  exportButtonText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '700', color: 'rgba(230,237,243,0.82)', textAlign: 'center' },
  exportHint: { marginTop: 3, textAlign: 'center', fontSize: 10, lineHeight: 13, color: 'rgba(230,237,243,0.48)' },
  devSeedButton: {
    marginTop: 6, minHeight: 32, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(212,160,23,0.22)', backgroundColor: 'rgba(212,160,23,0.075)',
  },
  devSeedButtonCompactLandscape: { minHeight: 30, borderRadius: 11, marginTop: 5 },
  devSeedButtonText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '800', color: TACTICAL.amber, textAlign: 'center' },
  recoveryTitle: { fontSize: 20, lineHeight: 24, fontWeight: '800', color: TACTICAL.text },
  recoveryTitleCompactLandscape: { fontSize: 18, lineHeight: 22 },
  recoverySupporting: { marginTop: 4, marginBottom: 10, fontSize: 13, lineHeight: 18, color: TACTICAL.textMuted },
  recoverySupportingCompactLandscape: { marginBottom: 8, lineHeight: 17 },
  linkRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  bottomLinkHit: { minHeight: 30, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, justifyContent: 'center' },
  bottomLinkText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: TACTICAL.textMuted },
  footerBlock: { alignSelf: 'center', alignItems: 'center', width: '100%' },
  footerLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', rowGap: 8, columnGap: 10 },
  footerPill: { minHeight: 28, minWidth: 72, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.045)', backgroundColor: 'rgba(255,255,255,0.016)' },
  footerPillText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: 'rgba(212,160,23,0.9)', letterSpacing: 0.5, textAlign: 'center' },
  createAccountHit: { marginTop: 10, minHeight: 28, justifyContent: 'center' },
  createAccountHitCompactLandscape: { marginTop: 7, minHeight: 24 },
  createAccountText: { fontSize: 14, lineHeight: 18, fontWeight: '800', color: TACTICAL.amber, textAlign: 'center' },
  loginLegalFooter: { marginTop: 8 },
  utilityPressed: { opacity: 0.72 },
  disabledUtility: { opacity: 0.52 },
});

const LoginHeaderBlock = memo(function LoginHeaderBlock({
  headerHeight,
  logoWidth,
  logoHeight,
  frameWidth,
}: {
  headerHeight: number;
  logoWidth: number;
  logoHeight: number;
  frameWidth?: number;
}) {
  return (
    <View
      style={[
        styles.logoFrame,
        { height: headerHeight },
        frameWidth != null ? { width: frameWidth } : null,
      ]}
    >
      <Image
        source={LOGIN_LOGO}
        resizeMode="contain"
        style={[styles.logoImage, { width: logoWidth, height: logoHeight }]}
      />
    </View>
  );
});

const LoginConnectionStatus = memo(function LoginConnectionStatus({
  isOnline,
  compactLayout,
}: {
  isOnline: boolean;
  compactLayout: boolean;
}) {
  return (
    <View style={[styles.formStatusSlot, compactLayout ? styles.formStatusSlotLandscape : null]}>
      <View style={styles.onlineRow}>
        <Ionicons
          name={isOnline ? 'wifi' : 'cloud-offline-outline'}
          size={12}
          color={isOnline ? '#5BCB79' : 'rgba(230,237,243,0.62)'}
        />
        <Text style={[styles.onlineText, !isOnline ? styles.offlineText : null]}>
          {isOnline ? 'Online' : 'Offline'}
        </Text>
      </View>
    </View>
  );
});

const LoginFooterBlock = memo(function LoginFooterBlock({
  footerMaxWidth,
  marginTop,
  onOpenAuthInfo,
  onCreateAccount,
  compactLayout = false,
}: {
  footerMaxWidth: number;
  marginTop: number;
  onOpenAuthInfo: (sheet: 'terms' | 'privacy' | 'support') => void;
  onCreateAccount: () => void;
  compactLayout?: boolean;
}) {
  return (
    <View style={[styles.footerBlock, { marginTop, maxWidth: footerMaxWidth }]}>
      <View style={styles.footerLinkRow}>
        <Pressable
          style={({ pressed }) => [styles.footerPill, pressed ? styles.utilityPressed : null]}
          onPress={() => onOpenAuthInfo('privacy')}
        >
          <Text style={styles.footerPillText}>Policy</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.footerPill, pressed ? styles.utilityPressed : null]}
          onPress={() => onOpenAuthInfo('terms')}
        >
          <Text style={styles.footerPillText}>Site Use</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.footerPill, pressed ? styles.utilityPressed : null]}
          onPress={() => onOpenAuthInfo('support')}
        >
          <Text style={styles.footerPillText}>Support</Text>
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.createAccountHit,
          compactLayout ? styles.createAccountHitCompactLandscape : null,
          pressed ? styles.utilityPressed : null,
        ]}
        onPress={onCreateAccount}
      >
        <Text style={styles.createAccountText}>{AUTH_COPY.login.createAccount}</Text>
      </Pressable>
      <LegalFooter style={styles.loginLegalFooter} />
    </View>
  );
});

type LoginCardProps = {
  email: string;
  emailError: string;
  password: string;
  passwordError: string;
  showPassword: boolean;
  keepSignedIn: boolean;
  loading: boolean;
  utilityBusy: boolean;
  loginDisabled: boolean;
  renderMessage: React.ReactNode;
  hasMessage: boolean;
  primaryPressScale: Animated.Value;
  passwordRef: React.RefObject<TextInput | null>;
  exportingLocalData: boolean;
  importingLocalData: boolean;
  devSeedingLocalData: boolean;
  isDevSmokeSeedEnabled: boolean;
  footerMaxWidth: number;
  compactLayout: boolean;
  cardMaxHeight: number | null;
  cardScrollEnabled: boolean;
  onClearStatus: () => void;
  onSetEmail: React.Dispatch<React.SetStateAction<string>>;
  onSetPassword: React.Dispatch<React.SetStateAction<string>>;
  onSetKeepSignedIn: React.Dispatch<React.SetStateAction<boolean>>;
  onSetMode: React.Dispatch<React.SetStateAction<ScreenMode>>;
  onTogglePassword: () => void;
  onPrimaryPressIn: () => void;
  onPrimaryPressOut: () => void;
  onLoginSubmit: (source: 'cta_press' | 'password_submit' | 'accessibility_activate') => void;
  onContinueFree: () => void;
  onViewPro: () => void;
  onExport: () => Promise<void>;
  onImport: () => Promise<void>;
  onDevSmokeSeed: () => Promise<void>;
  onOpenAuthInfo: (sheet: 'terms' | 'privacy' | 'support') => void;
  onCreateAccount: () => void;
};

const LoginCard = memo(function LoginCard({
  email,
  emailError,
  password,
  passwordError,
  showPassword,
  keepSignedIn,
  loading,
  utilityBusy,
  loginDisabled,
  renderMessage,
  hasMessage,
  primaryPressScale,
  passwordRef,
  exportingLocalData,
  importingLocalData,
  devSeedingLocalData,
  isDevSmokeSeedEnabled,
  footerMaxWidth,
  compactLayout,
  cardMaxHeight,
  cardScrollEnabled,
  onClearStatus,
  onSetEmail,
  onSetPassword,
  onSetKeepSignedIn,
  onSetMode,
  onTogglePassword,
  onPrimaryPressIn,
  onPrimaryPressOut,
  onLoginSubmit,
  onContinueFree,
  onViewPro,
  onExport,
  onImport,
  onDevSmokeSeed,
  onOpenAuthInfo,
  onCreateAccount,
}: LoginCardProps) {
  const cardContent = (
    <>
      <View style={[styles.fieldBlock, compactLayout ? styles.fieldBlockCompactLandscape : null]}>
        <Text style={styles.fieldLabel}>EMAIL</Text>
        <View style={[styles.inputShell, compactLayout ? styles.inputShellCompactLandscape : null]}>
          <Ionicons name="mail-outline" size={16} color="rgba(230,237,243,0.38)" />
          <TextInput
            value={email}
            onChangeText={(text) => {
              onSetEmail(text);
              onClearStatus();
            }}
            placeholder={AUTH_COPY.login.emailPlaceholder}
            placeholderTextColor="rgba(139,148,158,0.74)"
            style={[styles.input, compactLayout ? styles.inputCompactLandscape : null]}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
            keyboardAppearance="dark"
            returnKeyType="next"
            testID="auth-email-input"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!loading}
            selectionColor={TACTICAL.amber}
            cursorColor={TACTICAL.amber}
          />
        </View>
        {!!emailError && <Text style={styles.inlineError}>{emailError}</Text>}
      </View>

      <View style={[styles.fieldBlock, compactLayout ? styles.fieldBlockCompactLandscape : null]}>
        <View style={styles.passwordLabelRow}>
          <Text style={styles.fieldLabel}>PASSWORD</Text>
          <Pressable onPress={() => onSetMode('forgot')} style={({ pressed }) => [styles.inlineUtilityHit, pressed ? styles.utilityPressed : null]}>
            <Text style={styles.inlineUtilityText}>{AUTH_COPY.login.forgotPassword}</Text>
          </Pressable>
        </View>
        <View style={[styles.inputShell, compactLayout ? styles.inputShellCompactLandscape : null]}>
          <Ionicons name="lock-closed-outline" size={16} color="rgba(230,237,243,0.38)" />
          <TextInput
            ref={passwordRef}
            value={password}
            onChangeText={(text) => {
              onSetPassword(text);
              onClearStatus();
            }}
            placeholder={AUTH_COPY.login.passwordPlaceholder}
            placeholderTextColor="rgba(139,148,158,0.74)"
            style={[styles.input, compactLayout ? styles.inputCompactLandscape : null]}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="current-password"
            textContentType="password"
            secureTextEntry={!showPassword}
            keyboardAppearance="dark"
            returnKeyType="go"
            blurOnSubmit={false}
            testID="auth-password-input"
            onSubmitEditing={() => onLoginSubmit('password_submit')}
            editable={!loading}
            selectionColor={TACTICAL.amber}
            cursorColor={TACTICAL.amber}
          />
          <PasswordVisibilityToggle visible={showPassword} onPress={onTogglePassword} />
        </View>
        {!!passwordError && <Text style={styles.inlineError}>{passwordError}</Text>}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.rememberRow,
          compactLayout ? styles.rememberRowCompactLandscape : null,
          pressed ? styles.utilityPressed : null,
        ]}
        onPress={() => onSetKeepSignedIn((current) => !current)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: keepSignedIn }}
      >
        <View style={[styles.checkbox, keepSignedIn ? styles.checkboxChecked : null]}>
          {keepSignedIn ? <Ionicons name="checkmark" size={14} color={ECS.bgPrimary} /> : null}
        </View>
        <Text style={styles.rememberText}>Keep me signed in for 30 days</Text>
      </Pressable>

      <Animated.View style={{ width: '100%', transform: [{ scale: primaryPressScale }] }}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            compactLayout ? styles.primaryButtonCompactLandscape : null,
            loginDisabled ? styles.primaryButtonDisabled : null,
            pressed && !loginDisabled ? styles.primaryButtonPressed : null,
          ]}
          disabled={loginDisabled}
          onPressIn={loginDisabled ? undefined : onPrimaryPressIn}
          onPressOut={loginDisabled ? undefined : onPrimaryPressOut}
          onPress={() => onLoginSubmit('cta_press')}
          onAccessibilityTap={() => onLoginSubmit('accessibility_activate')}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'activate') {
              onLoginSubmit('accessibility_activate');
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign In"
          accessibilityHint="Sign in with your ECS email and password"
          accessible
          focusable
          accessibilityActions={[{ name: 'activate', label: 'Sign In' }]}
          accessibilityState={{ disabled: loginDisabled, busy: loading }}
          testID="auth-sign-in-button"
          hitSlop={8}
        >
          {loading ? (
            <View style={styles.primaryButtonContent}>
              <ActivityIndicator size="small" color={ECS.bgPrimary} />
              <Text style={styles.primaryButtonText}>{AUTH_COPY.login.primaryLoading}</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>{AUTH_COPY.login.primary}</Text>
          )}
        </Pressable>
      </Animated.View>

      <View
        style={[
          styles.messageSlot,
          compactLayout ? styles.messageSlotCompactLandscape : null,
          !hasMessage ? styles.messageSlotCollapsed : null,
          compactLayout && !hasMessage ? styles.messageSlotCollapsedCompactLandscape : null,
        ]}
      >
        {renderMessage}
      </View>

      <View style={[styles.orRow, compactLayout ? styles.orRowCompactLandscape : null]}>
        <View style={styles.orRule} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orRule} />
      </View>

      <View style={[styles.actionRow, compactLayout ? styles.actionRowCompactLandscape : null]}>
        <Pressable style={({ pressed }) => [styles.secondaryButton, compactLayout ? styles.secondaryButtonCompactLandscape : null, utilityBusy ? styles.disabledUtility : null, pressed && !utilityBusy ? styles.utilityPressed : null]} disabled={utilityBusy} onPress={onContinueFree}>
          <Ionicons name="phone-portrait-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.secondaryButtonTextPrimary}>Continue with Free</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.secondaryButton, compactLayout ? styles.secondaryButtonCompactLandscape : null, pressed ? styles.utilityPressed : null]} onPress={onViewPro}>
          <Ionicons name="diamond-outline" size={14} color="rgba(236,239,242,0.9)" />
          <Text style={styles.secondaryButtonText}>View Pro</Text>
        </Pressable>
      </View>

      <View style={[styles.dataTransferRow, compactLayout ? styles.dataTransferRowCompactLandscape : null]}>
        <Pressable style={({ pressed }) => [styles.exportButton, compactLayout ? styles.exportButtonCompactLandscape : null, utilityBusy ? styles.disabledUtility : null, pressed && !utilityBusy ? styles.utilityPressed : null]} disabled={utilityBusy} onPress={() => void onImport()}>
          {importingLocalData ? <ActivityIndicator size="small" color="rgba(230,237,243,0.82)" /> : <Ionicons name="cloud-upload-outline" size={15} color="rgba(230,237,243,0.82)" />}
          <Text style={styles.exportButtonText}>Import local data</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.exportButton, compactLayout ? styles.exportButtonCompactLandscape : null, utilityBusy ? styles.disabledUtility : null, pressed && !utilityBusy ? styles.utilityPressed : null]} disabled={utilityBusy} onPress={() => void onExport()}>
          {exportingLocalData ? <ActivityIndicator size="small" color="rgba(230,237,243,0.82)" /> : <Ionicons name="download-outline" size={15} color="rgba(230,237,243,0.82)" />}
          <Text style={styles.exportButtonText}>Export local data</Text>
        </Pressable>
      </View>
      <Text style={styles.exportHint}>Save your offline data as JSON before signing in or switching devices.</Text>
      {isDevSmokeSeedEnabled ? (
        <Pressable
          style={({ pressed }) => [
            styles.devSeedButton,
            compactLayout ? styles.devSeedButtonCompactLandscape : null,
            utilityBusy ? styles.disabledUtility : null,
            pressed && !utilityBusy ? styles.utilityPressed : null,
          ]}
          disabled={utilityBusy}
          onPress={() => void onDevSmokeSeed()}
          testID="auth-dev-smoke-seed-button"
        >
          {devSeedingLocalData ? <ActivityIndicator size="small" color={TACTICAL.amber} /> : <Ionicons name="flask-outline" size={15} color={TACTICAL.amber} />}
          <Text style={styles.devSeedButtonText}>Load smoke seed</Text>
        </Pressable>
      ) : null}
      <LoginFooterBlock
        footerMaxWidth={footerMaxWidth}
        marginTop={compactLayout ? 8 : 12}
        onOpenAuthInfo={onOpenAuthInfo}
        onCreateAccount={onCreateAccount}
        compactLayout={compactLayout}
      />
    </>
  );

  return (
    <View style={[styles.card, compactLayout ? styles.cardCompactLandscape : null, cardMaxHeight ? { maxHeight: cardMaxHeight } : null]}>
      {cardScrollEnabled ? (
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {cardContent}
        </ScrollView>
      ) : cardContent}
    </View>
  );
});

type ForgotPasswordCardProps = {
  resetEmail: string;
  resetEmailError: string;
  resetLoading: boolean;
  forgotDisabled: boolean;
  renderMessage: React.ReactNode;
  hasMessage: boolean;
  primaryPressScale: Animated.Value;
  onClearStatus: () => void;
  onSetResetEmail: React.Dispatch<React.SetStateAction<string>>;
  onPrimaryPressIn: () => void;
  onPrimaryPressOut: () => void;
  onForgotPassword: () => Promise<void>;
  onBackToLogin: () => void;
  onCreateAccount: () => void;
  compactLayout: boolean;
  cardMaxHeight: number | null;
  cardScrollEnabled: boolean;
};

const ForgotPasswordCard = memo(function ForgotPasswordCard({
  resetEmail,
  resetEmailError,
  resetLoading,
  forgotDisabled,
  renderMessage,
  hasMessage,
  primaryPressScale,
  onClearStatus,
  onSetResetEmail,
  onPrimaryPressIn,
  onPrimaryPressOut,
  onForgotPassword,
  onBackToLogin,
  onCreateAccount,
  compactLayout,
  cardMaxHeight,
  cardScrollEnabled,
}: ForgotPasswordCardProps) {
  const cardContent = (
    <>
      <Text style={[styles.recoveryTitle, compactLayout ? styles.recoveryTitleCompactLandscape : null]}>{AUTH_COPY.forgotPassword.title}</Text>
      <Text style={[styles.recoverySupporting, compactLayout ? styles.recoverySupportingCompactLandscape : null]}>{AUTH_COPY.forgotPassword.supporting}</Text>
      <View style={[styles.fieldBlock, compactLayout ? styles.fieldBlockCompactLandscape : null]}>
        <Text style={styles.fieldLabel}>EMAIL</Text>
        <View style={[styles.inputShell, compactLayout ? styles.inputShellCompactLandscape : null]}>
          <Ionicons name="mail-outline" size={16} color="rgba(230,237,243,0.38)" />
          <TextInput
            value={resetEmail}
            onChangeText={(text) => {
              onSetResetEmail(text);
              onClearStatus();
            }}
            placeholder={AUTH_COPY.login.emailPlaceholder}
            placeholderTextColor="rgba(139,148,158,0.74)"
            style={[styles.input, compactLayout ? styles.inputCompactLandscape : null]}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="email-address"
            autoComplete="email"
            keyboardAppearance="dark"
            returnKeyType="send"
            onSubmitEditing={() => { if (!forgotDisabled) void onForgotPassword(); }}
            editable={!resetLoading}
            selectionColor={TACTICAL.amber}
            cursorColor={TACTICAL.amber}
          />
        </View>
        {!!resetEmailError && <Text style={styles.inlineError}>{resetEmailError}</Text>}
      </View>
      <Animated.View style={{ width: '100%', transform: [{ scale: primaryPressScale }] }}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            compactLayout ? styles.primaryButtonCompactLandscape : null,
            forgotDisabled ? styles.primaryButtonDisabled : null,
            pressed && !forgotDisabled ? styles.primaryButtonPressed : null,
          ]}
          disabled={forgotDisabled}
          onPressIn={forgotDisabled ? undefined : onPrimaryPressIn}
          onPressOut={forgotDisabled ? undefined : onPrimaryPressOut}
          onPress={() => void onForgotPassword()}
        >
          {resetLoading ? (
            <View style={styles.primaryButtonContent}>
              <ActivityIndicator size="small" color={ECS.bgPrimary} />
              <Text style={styles.primaryButtonText}>{AUTH_COPY.forgotPassword.primaryLoading}</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>{AUTH_COPY.forgotPassword.primary}</Text>
          )}
        </Pressable>
      </Animated.View>
      <View style={styles.linkRow}>
        <Pressable style={({ pressed }) => [styles.bottomLinkHit, pressed ? styles.utilityPressed : null]} onPress={onBackToLogin}>
          <Text style={styles.bottomLinkText}>{AUTH_COPY.forgotPassword.back}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.bottomLinkHit, pressed ? styles.utilityPressed : null]} onPress={onCreateAccount}>
          <Text style={styles.bottomLinkText}>{AUTH_COPY.login.createAccount}</Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.messageSlot,
          compactLayout ? styles.messageSlotCompactLandscape : null,
          !hasMessage ? styles.messageSlotCollapsed : null,
          compactLayout && !hasMessage ? styles.messageSlotCollapsedCompactLandscape : null,
        ]}
      >
        {renderMessage}
      </View>
    </>
  );

  return (
    <View style={[styles.card, compactLayout ? styles.cardCompactLandscape : null, cardMaxHeight ? { maxHeight: cardMaxHeight } : null]}>
      {cardScrollEnabled ? (
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {cardContent}
        </ScrollView>
      ) : cardContent}
    </View>
  );
});
