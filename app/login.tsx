import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  Platform,
  Pressable,
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
import { maskAuthEmail } from '../lib/auth/authLogRedaction';
import { resolveAuthLayoutMetrics } from '../lib/auth/authResponsive';
import { exportLocalData } from '../lib/localDataExport';
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
  if (!isOnline || normalized.includes('offline') || normalized.includes('network')) return AUTH_COPY.login.offline;
  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('email and password') ||
    normalized.includes('password not recognized') ||
    normalized.includes('no account found')
  ) return AUTH_COPY.login.invalidCredentials;
  if (normalized.includes('too many requests') || normalized.includes('rate limit') || normalized.includes('too many attempts')) {
    return AUTH_COPY.login.rateLimited;
  }
  return AUTH_COPY.login.genericFailure;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
  const stableScreenHeight = useRef(Dimensions.get('screen').height).current;
  const layoutMetrics = useMemo(() => resolveAuthLayoutMetrics(width, stableScreenHeight), [stableScreenHeight, width]);

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
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<MessageTone>('neutral');
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
  const utilityBusy = loading || resetLoading || exportingLocalData;

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
  }, [clearStatus, enterOfflineMode, router]);

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
    if (!isOnline) {
      logAuthDev('[Auth] SignIn validation failed', {
        source,
        reason: 'offline',
      });
      setStatusMessage(AUTH_COPY.login.offline);
      setStatusTone('neutral');
      return;
    }

    logAuthDev('[Auth] SignIn validation passed', {
      source,
      email: maskAuthEmail(trimmedEmail),
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

  const renderMessage = statusMessage ? <AuthStatusBanner text={statusMessage} tone={statusTone} /> : !isOnline ? <AuthStatusBanner text={AUTH_COPY.login.offline} tone="neutral" /> : null;
  const footerMarginTop = layoutMetrics.compact ? 4 : Math.max(6, layoutMetrics.footerGap - 12);

  return (
    <View style={styles.heroScreen}>
      <LoginHeroBackground />
      <StatusBar style="light" />
      <View style={styles.heroContentLayer}>
        <View
          style={[
            styles.screenShell,
            {
              paddingTop: insets.top + layoutMetrics.topPadding,
              paddingBottom: insets.bottom + layoutMetrics.bottomPadding,
              paddingHorizontal: layoutMetrics.horizontalPadding,
            },
          ]}
        >
          <View style={styles.screenTopRegion}>
            <View style={[styles.contentShell, { maxWidth: layoutMetrics.columnMaxWidth }]}>
              <LoginHeaderBlock isOnline={isOnline} compact={layoutMetrics.compact} />
              {mode === 'login' ? (
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
                  exportingLocalData={exportingLocalData}
                  footerMaxWidth={layoutMetrics.footerMaxWidth}
                  onOpenAuthInfo={handleOpenAuthInfo}
                  onCreateAccount={handleCreateAccount}
                />
              ) : (
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
                />
              )}
              {mode !== 'login' ? (
                <LoginFooterBlock
                  footerMaxWidth={layoutMetrics.footerMaxWidth}
                  marginTop={footerMarginTop}
                  onOpenAuthInfo={handleOpenAuthInfo}
                  onCreateAccount={handleCreateAccount}
                />
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heroScreen: { flex: 1, backgroundColor: '#040608' },
  heroContentLayer: { ...StyleSheet.absoluteFillObject },
  screenShell: { flex: 1, justifyContent: 'space-between' },
  screenTopRegion: { flex: 1, justifyContent: 'center' },
  contentShell: { width: '100%', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  logoFrame: {
    width: '100%',
    minHeight: 172,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  logoFrameCompact: {
    minHeight: 154,
  },
  logoImage: {
    width: 228,
    height: 182,
    transform: [{ translateY: -16 }, { scale: 1.78 }],
  },
  logoImageCompact: {
    width: 212,
    height: 170,
    transform: [{ translateY: -12 }, { scale: 1.58 }],
  },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 6 },
  onlineText: { color: '#5BCB79', fontSize: 12, lineHeight: 15, fontWeight: '700' },
  offlineText: { color: 'rgba(230,237,243,0.62)' },
  card: {
    width: '100%', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 7, borderRadius: 20,
    backgroundColor: 'rgba(6,9,12,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.32, shadowRadius: 22, elevation: 7,
    marginTop: 2,
  },
  fieldBlock: { marginBottom: 6 },
  fieldLabel: { marginBottom: 4, fontSize: 11, lineHeight: 14, fontWeight: '800', color: 'rgba(230,237,243,0.9)', letterSpacing: 1.6 },
  passwordLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  inlineUtilityHit: { minHeight: 24, justifyContent: 'center' },
  inlineUtilityText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: TACTICAL.amber },
  inputShell: {
    minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(12,16,21,0.66)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  input: { flex: 1, fontSize: 15, lineHeight: 20, color: 'rgba(236,239,242,0.95)', paddingVertical: 9, minHeight: 38 },
  inlineError: { marginTop: 5, paddingLeft: 2, fontSize: 11, lineHeight: 14, fontWeight: '600', color: '#E2A29A' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28, marginTop: -3, marginBottom: 3 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(212,160,23,0.78)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: TACTICAL.amber, borderColor: TACTICAL.amber },
  rememberText: { flex: 1, fontSize: 13, lineHeight: 17, color: 'rgba(230,237,243,0.82)', fontWeight: '600' },
  primaryButton: { minHeight: 42, marginTop: 1, borderRadius: 12, backgroundColor: TACTICAL.amber, alignItems: 'center', justifyContent: 'center' },
  primaryButtonDisabled: { opacity: 0.46 },
  primaryButtonPressed: { opacity: 0.94, backgroundColor: TACTICAL.amberDark },
  primaryButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryButtonText: { fontSize: 16, lineHeight: 20, fontWeight: '800', color: ECS.bgPrimary, letterSpacing: 0.3 },
  messageRow: { marginTop: 6 },
  messageSlot: { marginTop: 5, minHeight: 28, justifyContent: 'center' },
  messageSlotCollapsed: { marginTop: 2, minHeight: 8 },
  orRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 10 },
  orRule: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  orText: { color: 'rgba(230,237,243,0.42)', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  actionRow: { marginTop: 5, flexDirection: 'row', gap: 8 },
  secondaryButton: {
    flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(6,8,10,0.28)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10,
  },
  secondaryButtonTextPrimary: { color: TACTICAL.amber, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  secondaryButtonText: { color: 'rgba(236,239,242,0.9)', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  exportButton: {
    marginTop: 5, minHeight: 34, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.025)',
  },
  exportButtonText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: 'rgba(230,237,243,0.82)' },
  exportHint: { marginTop: 3, textAlign: 'center', fontSize: 10, lineHeight: 13, color: 'rgba(230,237,243,0.48)' },
  recoveryTitle: { fontSize: 20, lineHeight: 24, fontWeight: '800', color: TACTICAL.text },
  recoverySupporting: { marginTop: 4, marginBottom: 10, fontSize: 13, lineHeight: 18, color: TACTICAL.textMuted },
  linkRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  bottomLinkHit: { minHeight: 30, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, justifyContent: 'center' },
  bottomLinkText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: TACTICAL.textMuted },
  footerBlock: { alignSelf: 'center', alignItems: 'center', width: '100%' },
  footerLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', rowGap: 8, columnGap: 10 },
  footerPill: { minHeight: 28, minWidth: 72, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.045)', backgroundColor: 'rgba(255,255,255,0.016)' },
  footerPillText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: 'rgba(212,160,23,0.9)', letterSpacing: 0.5, textAlign: 'center' },
  createAccountHit: { marginTop: 10, minHeight: 28, justifyContent: 'center' },
  createAccountText: { fontSize: 14, lineHeight: 18, fontWeight: '800', color: TACTICAL.amber, textAlign: 'center' },
  loginLegalFooter: { marginTop: 8 },
  utilityPressed: { opacity: 0.72 },
  disabledUtility: { opacity: 0.52 },
});

const LoginHeaderBlock = memo(function LoginHeaderBlock({
  isOnline,
  compact,
}: {
  isOnline: boolean;
  compact: boolean;
}) {
  return (
    <>
      <View style={[styles.logoFrame, compact ? styles.logoFrameCompact : null]}>
        <Image
          source={LOGIN_LOGO}
          resizeMode="contain"
          style={[styles.logoImage, compact ? styles.logoImageCompact : null]}
        />
      </View>
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
    </>
  );
});

const LoginFooterBlock = memo(function LoginFooterBlock({
  footerMaxWidth,
  marginTop,
  onOpenAuthInfo,
  onCreateAccount,
}: {
  footerMaxWidth: number;
  marginTop: number;
  onOpenAuthInfo: (sheet: 'terms' | 'privacy' | 'support') => void;
  onCreateAccount: () => void;
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
        style={({ pressed }) => [styles.createAccountHit, pressed ? styles.utilityPressed : null]}
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
  footerMaxWidth: number;
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
  footerMaxWidth,
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
  onOpenAuthInfo,
  onCreateAccount,
}: LoginCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>EMAIL</Text>
        <View style={styles.inputShell}>
          <Ionicons name="mail-outline" size={16} color="rgba(230,237,243,0.38)" />
          <TextInput
            value={email}
            onChangeText={(text) => {
              onSetEmail(text);
              onClearStatus();
            }}
            placeholder={AUTH_COPY.login.emailPlaceholder}
            placeholderTextColor="rgba(139,148,158,0.74)"
            style={styles.input}
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

      <View style={styles.fieldBlock}>
        <View style={styles.passwordLabelRow}>
          <Text style={styles.fieldLabel}>PASSWORD</Text>
          <Pressable onPress={() => onSetMode('forgot')} style={({ pressed }) => [styles.inlineUtilityHit, pressed ? styles.utilityPressed : null]}>
            <Text style={styles.inlineUtilityText}>{AUTH_COPY.login.forgotPassword}</Text>
          </Pressable>
        </View>
        <View style={styles.inputShell}>
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
            style={styles.input}
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
        style={({ pressed }) => [styles.rememberRow, pressed ? styles.utilityPressed : null]}
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
          style={({ pressed }) => [styles.primaryButton, loginDisabled ? styles.primaryButtonDisabled : null, pressed && !loginDisabled ? styles.primaryButtonPressed : null]}
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

      <View style={[styles.messageSlot, !hasMessage ? styles.messageSlotCollapsed : null]}>{renderMessage}</View>

      <View style={styles.orRow}>
        <View style={styles.orRule} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orRule} />
      </View>

      <View style={styles.actionRow}>
        <Pressable style={({ pressed }) => [styles.secondaryButton, utilityBusy ? styles.disabledUtility : null, pressed && !utilityBusy ? styles.utilityPressed : null]} disabled={utilityBusy} onPress={onContinueFree}>
          <Ionicons name="phone-portrait-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.secondaryButtonTextPrimary}>Continue with Free</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed ? styles.utilityPressed : null]} onPress={onViewPro}>
          <Ionicons name="diamond-outline" size={14} color="rgba(236,239,242,0.9)" />
          <Text style={styles.secondaryButtonText}>View Pro</Text>
        </Pressable>
      </View>

      <Pressable style={({ pressed }) => [styles.exportButton, utilityBusy ? styles.disabledUtility : null, pressed && !utilityBusy ? styles.utilityPressed : null]} disabled={utilityBusy} onPress={() => void onExport()}>
        {exportingLocalData ? <ActivityIndicator size="small" color="rgba(230,237,243,0.82)" /> : <Ionicons name="download-outline" size={15} color="rgba(230,237,243,0.82)" />}
        <Text style={styles.exportButtonText}>Export local data</Text>
      </Pressable>
      <Text style={styles.exportHint}>Save your offline data as JSON before signing in or switching devices.</Text>
      <LoginFooterBlock
        footerMaxWidth={footerMaxWidth}
        marginTop={12}
        onOpenAuthInfo={onOpenAuthInfo}
        onCreateAccount={onCreateAccount}
      />
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
}: ForgotPasswordCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.recoveryTitle}>{AUTH_COPY.forgotPassword.title}</Text>
      <Text style={styles.recoverySupporting}>{AUTH_COPY.forgotPassword.supporting}</Text>
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>EMAIL</Text>
        <View style={styles.inputShell}>
          <Ionicons name="mail-outline" size={16} color="rgba(230,237,243,0.38)" />
          <TextInput
            value={resetEmail}
            onChangeText={(text) => {
              onSetResetEmail(text);
              onClearStatus();
            }}
            placeholder={AUTH_COPY.login.emailPlaceholder}
            placeholderTextColor="rgba(139,148,158,0.74)"
            style={styles.input}
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
          style={({ pressed }) => [styles.primaryButton, forgotDisabled ? styles.primaryButtonDisabled : null, pressed && !forgotDisabled ? styles.primaryButtonPressed : null]}
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
      <View style={[styles.messageSlot, !hasMessage ? styles.messageSlotCollapsed : null]}>{renderMessage}</View>
    </View>
  );
});
