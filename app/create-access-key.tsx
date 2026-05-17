import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import AdaptiveBackground from '../components/login/AdaptiveBackground';
import AuthBrandLockup from '../components/login/AuthBrandLockup';
import AuthFooterStack from '../components/login/AuthFooterStack';
import AuthFormSurface from '../components/login/AuthFormSurface';
import AuthStatusBanner from '../components/login/AuthStatusBanner';
import PasswordVisibilityToggle from '../components/login/PasswordVisibilityToggle';
import { SafeIcon as Ionicons } from '../components/SafeIcon';
import { AUTH_COPY } from '../lib/auth/authCopy';
import { resolveAuthLayoutMetrics } from '../lib/auth/authResponsive';
import { AUTH_SURFACE } from '../lib/auth/authSurface';
import { AUTH_VISUAL_SPEC } from '../lib/auth/authVisualSpec';
import { ECS, TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';

const APP_VERSION = '2.4.0';

const RULES = [
  { label: 'At least 10 characters', test: (value: string) => value.length >= 10 },
  { label: 'Upper and lowercase letters', test: (value: string) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: 'At least one number', test: (value: string) => /\d/.test(value) },
  { label: 'At least one symbol', test: (value: string) => /[^a-zA-Z0-9]/.test(value) },
] as const;

type SetupMode = 'signup' | 'reset' | 'activate';

export default function CreateAccessKeyScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mode?: string }>();
  const { signUp, signOut, updatePassword, user, authLoading, isOnline } = useApp();
  const layoutMetrics = useMemo(() => resolveAuthLayoutMetrics(width, height), [width, height]);

  const setupMode: SetupMode =
    params.mode === 'signup'
      ? 'signup'
      : params.mode === 'reset'
        ? 'reset'
        : 'activate';

  const email = typeof params.email === 'string' ? params.email : user?.email ?? '';
  const isSignupMode = setupMode === 'signup';
  const isResetMode = setupMode === 'reset';
  const isActivationMode = setupMode === 'activate';
  const hasCredentialSession = !!user;
  const verificationPending = !isSignupMode && authLoading;
  const linkUnavailable = !isSignupMode && !authLoading && !hasCredentialSession && isOnline;
  const linkVerificationFailed = !isSignupMode && !authLoading && !hasCredentialSession && !isOnline;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [loading, setLoading] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [completionState, setCompletionState] = useState<'idle' | 'signup_success' | 'password_updated'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<'error' | 'success' | 'neutral'>('neutral');

  const rules = useMemo(
    () => RULES.map((rule) => ({ ...rule, passed: rule.test(password) })),
    [password],
  );
  const allRulesPassed = rules.every((rule) => rule.passed);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const passwordError =
    submitAttempted && !password
      ? isSignupMode
        ? AUTH_COPY.login.missingPassword
        : isResetMode
          ? AUTH_COPY.resetPassword.missingPassword
          : 'Enter a password.'
      : '';
  const confirmError = !confirmPassword
    ? submitAttempted
      ? isSignupMode
        ? 'Confirm your password.'
        : isResetMode
          ? AUTH_COPY.resetPassword.missingConfirmation
          : 'Confirm your password.'
      : ''
    : !passwordsMatch
      ? AUTH_COPY.resetPassword.mismatch
      : '';

  const title = isSignupMode
    ? AUTH_COPY.signup.title
    : isResetMode
      ? AUTH_COPY.resetPassword.title
      : AUTH_COPY.activation.setupTitle;
  const supporting = isSignupMode
    ? AUTH_COPY.signup.supporting
    : isResetMode
      ? AUTH_COPY.resetPassword.supporting
      : AUTH_COPY.activation.setupSupporting;
  const primaryAction = isSignupMode
    ? AUTH_COPY.signup.primary
    : isResetMode
      ? AUTH_COPY.resetPassword.primary
      : AUTH_COPY.activation.setupPrimary;
  const loadingAction = isSignupMode
    ? AUTH_COPY.signup.primaryLoading
    : isResetMode
      ? AUTH_COPY.resetPassword.primaryLoading
      : AUTH_COPY.activation.setupLoading;

  const disabled =
    loading ||
    verificationPending ||
    linkUnavailable ||
    linkVerificationFailed ||
    !allRulesPassed ||
    !password ||
    !confirmPassword ||
    !passwordsMatch;

  const handleBack = () => {
    Keyboard.dismiss();
    router.replace('/login');
  };

  const togglePasswordVisibility = () => {
    setShowPassword((current) => !current);
    requestAnimationFrame(() => {
      passwordRef.current?.focus();
    });
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword((current) => !current);
    requestAnimationFrame(() => {
      confirmPasswordRef.current?.focus();
    });
  };

  const handleRequestNewLink = () => {
    Keyboard.dismiss();
    router.replace({
      pathname: '/login',
      params: {
        mode: 'forgot',
        ...(email ? { email } : {}),
      },
    });
  };

  const handleContinueToSignIn = async () => {
    Keyboard.dismiss();
    await signOut();
    router.replace({
      pathname: '/login',
      params: { reason: isActivationMode ? 'access-ready' : 'password-updated' },
    });
  };

  const handleSubmit = async () => {
    setStatusMessage('');
    setStatusTone('neutral');
    setSubmitAttempted(true);
    if (disabled) return;

    setLoading(true);
    const result = isSignupMode ? await signUp(email, password) : await updatePassword(password);
    setLoading(false);

    if (result.error) {
      setStatusMessage(
        isSignupMode
          ? AUTH_COPY.signup.failure
          : isResetMode
            ? AUTH_COPY.resetPassword.failure
            : AUTH_COPY.activation.setupFailure,
      );
      setStatusTone('error');
      return;
    }

    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setSubmitAttempted(false);

    if (isSignupMode) {
      setCompletionState('signup_success');
      return;
    }

    setCompletionState('password_updated');
  };

  const renderTopSupporting = () => {
    if (completionState === 'signup_success') {
      return AUTH_COPY.signup.successLine;
    }
    if (completionState === 'password_updated') {
      return isActivationMode
        ? AUTH_COPY.activation.successLine
        : AUTH_COPY.resetPassword.successLine;
    }
    if (verificationPending) {
      return isResetMode
        ? AUTH_COPY.resetPassword.verifying
        : AUTH_COPY.activation.verifying;
    }
    if (linkUnavailable) {
      return isResetMode
        ? AUTH_COPY.resetPassword.invalidLink
        : AUTH_COPY.activation.invalid;
    }
    if (linkVerificationFailed) {
      return isResetMode
        ? AUTH_COPY.resetPassword.verifyFailure
        : AUTH_COPY.activation.verifyFailure;
    }
    return supporting;
  };

  const renderStateBlock = () => {
    if (verificationPending) {
      return (
        <View style={styles.stateBlock}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
          <Text style={styles.stateLead}>{isResetMode ? AUTH_COPY.resetPassword.verifying : AUTH_COPY.activation.verifying}</Text>
          <Text style={styles.stateSupporting}>
            {isResetMode
              ? 'Checking password recovery state and preparing a secure return to ECS.'
              : 'Checking authorized access and preparing first-time ECS setup.'}
          </Text>
          <View style={styles.secondaryRow}>
            <TouchableOpacity activeOpacity={0.72} onPress={handleBack}>
                <Text style={styles.secondaryAction}>{AUTH_COPY.forgotPassword.back}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (completionState === 'signup_success') {
      return (
        <View style={styles.stateBlock}>
          <Text style={styles.stateLead}>{AUTH_COPY.signup.successTitle}</Text>
          <Text style={styles.stateSupporting}>
            {AUTH_COPY.signup.successLine}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.86}
            onPress={handleBack}
          >
            <Text style={styles.primaryButtonText}>{AUTH_COPY.resetPassword.successCta}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (completionState === 'password_updated') {
      return (
        <View style={styles.stateBlock}>
          <Text style={styles.stateLead}>{isActivationMode ? AUTH_COPY.activation.successTitle : AUTH_COPY.resetPassword.successTitle}</Text>
          <Text style={styles.stateSupporting}>
            {isActivationMode
              ? AUTH_COPY.activation.successLine
              : AUTH_COPY.resetPassword.successLine}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.86}
            onPress={() => void handleContinueToSignIn()}
          >
            <Text style={styles.primaryButtonText}>{AUTH_COPY.resetPassword.successCta}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (linkUnavailable || linkVerificationFailed) {
      return (
        <View style={styles.stateBlock}>
          <Text style={styles.stateLead}>
            {isResetMode ? 'Reset link unavailable' : 'Activation unavailable'}
          </Text>
          <Text style={styles.stateSupporting}>
            {linkUnavailable
              ? isResetMode
                ? AUTH_COPY.resetPassword.invalidLink
                : AUTH_COPY.activation.invalid
              : isResetMode
                ? AUTH_COPY.resetPassword.verifyFailure
                : AUTH_COPY.activation.verifyFailure}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.86}
            onPress={isResetMode && linkUnavailable ? handleRequestNewLink : handleBack}
          >
            <Text style={styles.primaryButtonText}>
              {isResetMode && linkUnavailable ? AUTH_COPY.resetPassword.requestNewLink : AUTH_COPY.forgotPassword.back}
            </Text>
          </TouchableOpacity>
          {isResetMode ? (
            <View style={styles.secondaryRow}>
              <TouchableOpacity
                activeOpacity={0.72}
                onPress={linkUnavailable ? handleBack : handleRequestNewLink}
              >
                <Text style={styles.secondaryAction}>
                  {linkUnavailable ? AUTH_COPY.forgotPassword.back : AUTH_COPY.resetPassword.requestNewLink}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }

    return (
      <>
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>
            {isSignupMode
              ? AUTH_COPY.login.passwordLabel
              : isResetMode
              ? AUTH_COPY.resetPassword.passwordLabel
              : AUTH_COPY.login.passwordLabel}
          </Text>
          <View style={[styles.inputShell, passwordError ? styles.inputShellError : null]}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              placeholder={isResetMode ? AUTH_COPY.resetPassword.passwordPlaceholder : AUTH_COPY.login.passwordPlaceholder}
              placeholderTextColor="rgba(139,148,158,0.62)"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              importantForAutofill="yes"
              keyboardAppearance="dark"
              enablesReturnKeyAutomatically
              selectionColor={TACTICAL.amber}
              cursorColor={TACTICAL.amber}
              returnKeyType="next"
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            />
            <PasswordVisibilityToggle
              visible={showPassword}
              onPress={togglePasswordVisibility}
              style={styles.trailingAction}
              textStyle={styles.trailingActionText}
            />
          </View>
          <View style={styles.fieldFeedbackSlot}>
            {!!passwordError && <Text style={styles.inlineError}>{passwordError}</Text>}
          </View>
        </View>

        <View style={styles.rulesCard}>
          {rules.map((rule) => (
            <View key={rule.label} style={styles.ruleRow}>
              <Ionicons
                name={rule.passed ? 'checkmark-circle-outline' : 'ellipse-outline'}
                size={14}
                color={rule.passed ? TACTICAL.amber : TACTICAL.textMuted}
              />
              <Text style={[styles.ruleText, rule.passed ? styles.ruleTextPassed : null]}>
                {rule.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{AUTH_COPY.resetPassword.confirmLabel}</Text>
          <View style={[styles.inputShell, confirmError ? styles.inputShellError : null]}>
            <TextInput
              ref={confirmPasswordRef}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={
                isResetMode
                  ? AUTH_COPY.resetPassword.confirmPlaceholder
                  : AUTH_COPY.resetPassword.confirmLabel
              }
              placeholderTextColor="rgba(139,148,158,0.62)"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              secureTextEntry={!showConfirmPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              importantForAutofill="yes"
              keyboardAppearance="dark"
              enablesReturnKeyAutomatically
              selectionColor={TACTICAL.amber}
              cursorColor={TACTICAL.amber}
              returnKeyType="go"
              onSubmitEditing={() => void handleSubmit()}
            />
            <PasswordVisibilityToggle
              visible={showConfirmPassword}
              onPress={toggleConfirmPasswordVisibility}
              style={styles.trailingAction}
              textStyle={styles.trailingActionText}
            />
          </View>
          <View style={styles.fieldFeedbackSlot}>
            {!!confirmError && <Text style={styles.inlineError}>{confirmError}</Text>}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, disabled ? styles.primaryButtonDisabled : null]}
          activeOpacity={0.86}
          disabled={disabled}
          onPress={() => void handleSubmit()}
        >
          {loading ? (
            <View style={styles.primaryButtonContent}>
              <ActivityIndicator size="small" color={ECS.bgPrimary} />
              <Text style={styles.primaryButtonText}>{loadingAction}</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>{primaryAction}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.secondaryRow}>
          <TouchableOpacity activeOpacity={0.72} onPress={handleBack}>
            <Text style={styles.secondaryAction}>{AUTH_COPY.forgotPassword.back}</Text>
          </TouchableOpacity>
        </View>

        {!!statusMessage && (
          <View
            style={[
              styles.messageRow,
            ]}
          >
            <AuthStatusBanner text={statusMessage} tone={statusTone} />
          </View>
        )}
      </>
    );
  };

  return (
    <AdaptiveBackground>
      <Pressable style={styles.flex} onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: insets.top + layoutMetrics.topPadding,
                paddingBottom: insets.bottom + layoutMetrics.bottomPadding,
                paddingHorizontal: layoutMetrics.horizontalPadding,
                justifyContent: layoutMetrics.centerContent ? 'center' : 'flex-start',
              },
            ]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.contentShell, { maxWidth: layoutMetrics.columnMaxWidth }]}>
              <View style={[styles.brandBlock, { marginBottom: layoutMetrics.brandGap }]}>
                <AuthBrandLockup
                  title={
                    completionState === 'signup_success'
                      ? AUTH_COPY.signup.successTitle
                      : completionState === 'password_updated'
                        ? isActivationMode
                          ? AUTH_COPY.activation.successTitle
                          : AUTH_COPY.resetPassword.successTitle
                        : verificationPending || linkUnavailable || linkVerificationFailed
                          ? isResetMode
                            ? AUTH_COPY.forgotPassword.title
                            : AUTH_COPY.activation.title
                          : title
                  }
                  supporting={renderTopSupporting()}
                />
                {!!email && <Text style={styles.emailBadge}>{email}</Text>}
              </View>

              <AuthFormSurface style={[styles.panel, { maxWidth: layoutMetrics.columnMaxWidth }]}>
                {renderStateBlock()}
              </AuthFormSurface>

              <AuthFooterStack
                version={APP_VERSION}
                containerStyle={[
                  styles.footerBlock,
                  { marginTop: layoutMetrics.footerGap, maxWidth: layoutMetrics.footerMaxWidth },
                ]}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Pressable>
    </AdaptiveBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
  contentShell: {
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
  },
  brandBlock: {
    marginBottom: AUTH_VISUAL_SPEC.spacing.brandGap.standardPhone,
  },
  footerBlock: {
    marginTop: AUTH_VISUAL_SPEC.spacing.footerGap.standardPhone,
  },
  emailBadge: {
    marginTop: AUTH_VISUAL_SPEC.spacing.emailBadgeMarginTop,
    fontSize: AUTH_VISUAL_SPEC.typography.emailBadge.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.emailBadge.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.emailBadge.fontWeight,
    color: TACTICAL.amber,
  },
  panel: {
    width: '100%',
  },
  fieldBlock: {
    marginBottom: AUTH_SURFACE.fieldGap,
  },
  fieldLabel: {
    marginBottom: AUTH_SURFACE.fieldLabelGap,
    fontSize: AUTH_VISUAL_SPEC.typography.fieldLabel.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.fieldLabel.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.fieldLabel.fontWeight,
    color: TACTICAL.text,
    letterSpacing: AUTH_VISUAL_SPEC.typography.fieldLabel.letterSpacing,
  },
  inputShell: {
    minHeight: AUTH_SURFACE.inputMinHeight,
    borderRadius: AUTH_SURFACE.inputRadius,
    borderWidth: 1,
    borderColor: AUTH_SURFACE.inputBorder,
    backgroundColor: AUTH_SURFACE.inputBackground,
    paddingHorizontal: AUTH_SURFACE.inputPaddingX,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputShellError: {
    borderColor: AUTH_SURFACE.inputErrorBorder,
  },
  input: {
    flex: 1,
    fontSize: AUTH_VISUAL_SPEC.typography.inputText.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.inputText.lineHeight,
    color: TACTICAL.text,
    paddingVertical: AUTH_VISUAL_SPEC.spacing.inputTextPaddingY,
  },
  trailingAction: {},
  trailingActionText: {
  },
  rulesCard: {
    borderRadius: AUTH_SURFACE.subSurfaceRadius,
    borderWidth: 1,
    borderColor: AUTH_SURFACE.subSurfaceBorder,
    backgroundColor: AUTH_SURFACE.subSurfaceBackground,
    paddingHorizontal: AUTH_SURFACE.inputPaddingX,
    paddingVertical: AUTH_VISUAL_SPEC.spacing.rulesCardPaddingY,
    marginBottom: AUTH_SURFACE.fieldGap,
    gap: AUTH_VISUAL_SPEC.spacing.rulesCardGap,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleText: {
    fontSize: AUTH_VISUAL_SPEC.typography.ruleText.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.ruleText.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.ruleText.fontWeight,
    color: TACTICAL.textMuted,
  },
  ruleTextPassed: {
    color: TACTICAL.amber,
  },
  inlineError: {
    marginTop: AUTH_VISUAL_SPEC.spacing.feedbackGap,
    paddingLeft: 2,
    fontSize: AUTH_VISUAL_SPEC.typography.inlineError.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.inlineError.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.inlineError.fontWeight,
    color: '#E2A29A',
  },
  fieldFeedbackSlot: {
    minHeight: AUTH_VISUAL_SPEC.spacing.feedbackSlotMinHeight,
  },
  primaryButton: {
    minHeight: AUTH_SURFACE.primaryHeight,
    marginTop: AUTH_VISUAL_SPEC.spacing.primaryButtonMarginTop,
    borderRadius: AUTH_SURFACE.primaryRadius,
    backgroundColor: TACTICAL.amber,
    borderWidth: 1,
    borderColor: AUTH_SURFACE.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AUTH_SURFACE.primaryShadowColor,
    shadowOffset: AUTH_SURFACE.primaryShadowOffset,
    shadowOpacity: AUTH_SURFACE.primaryShadowOpacity,
    shadowRadius: AUTH_SURFACE.primaryShadowRadius,
    elevation: AUTH_SURFACE.primaryElevation,
    alignSelf: 'stretch',
  },
  primaryButtonDisabled: {
    opacity: 0.46,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: AUTH_VISUAL_SPEC.typography.primaryButton.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.primaryButton.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.primaryButton.fontWeight,
    color: AUTH_SURFACE.primaryText,
    letterSpacing: AUTH_VISUAL_SPEC.typography.primaryButton.letterSpacing,
  },
  secondaryRow: {
    marginTop: AUTH_VISUAL_SPEC.spacing.secondaryRowMarginTop,
    paddingTop: AUTH_VISUAL_SPEC.spacing.secondaryRowPaddingTop,
    borderTopWidth: 1,
    borderTopColor: AUTH_SURFACE.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryAction: {
    fontSize: AUTH_VISUAL_SPEC.typography.secondaryAction.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.secondaryAction.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.secondaryAction.fontWeight,
    color: TACTICAL.textMuted,
  },
  stateBlock: {
    alignItems: 'center',
    gap: AUTH_VISUAL_SPEC.spacing.stateBlockGap,
    paddingVertical: AUTH_VISUAL_SPEC.spacing.stateBlockPaddingY,
  },
  stateLead: {
    fontSize: AUTH_VISUAL_SPEC.typography.stateLead.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.stateLead.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.stateLead.fontWeight,
    textAlign: 'center',
    color: TACTICAL.text,
    letterSpacing: AUTH_VISUAL_SPEC.typography.stateLead.letterSpacing,
  },
  stateSupporting: {
    maxWidth: AUTH_VISUAL_SPEC.state.supportingMaxWidth,
    fontSize: AUTH_VISUAL_SPEC.typography.stateSupporting.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.stateSupporting.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.stateSupporting.fontWeight,
    textAlign: 'center',
    color: TACTICAL.textMuted,
  },
  messageRow: {
    marginTop: AUTH_VISUAL_SPEC.spacing.messageRowMarginTop,
  },
});
