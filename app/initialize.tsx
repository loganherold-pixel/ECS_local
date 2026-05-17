import React, { useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';

import AuthBrandLockup from '../components/login/AuthBrandLockup';
import AuthFormSurface from '../components/login/AuthFormSurface';
import AuthStatusBanner from '../components/login/AuthStatusBanner';
import LoginHeroBackground from '../components/login/LoginHeroBackground';
import { AUTH_COPY } from '../lib/auth/authCopy';
import { resolveAuthLayoutMetrics } from '../lib/auth/authResponsive';
import { AUTH_SURFACE } from '../lib/auth/authSurface';
import { AUTH_VISUAL_SPEC } from '../lib/auth/authVisualSpec';
import { ECS, TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';

const COPY = {
  title: AUTH_COPY.signup.title,
  supporting: AUTH_COPY.signup.supporting,
  emailLabel: AUTH_COPY.login.emailLabel,
  emailPlaceholder: AUTH_COPY.login.emailPlaceholder,
  primary: AUTH_COPY.signup.primary,
  loading: AUTH_COPY.signup.primaryLoading,
  back: AUTH_COPY.forgotPassword.back,
  invalidEmail: AUTH_COPY.login.invalidEmail,
  offline: AUTH_COPY.login.offline,
} as const;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function InitializeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { isOnline } = useApp();
  const layoutMetrics = useMemo(() => resolveAuthLayoutMetrics(width, height), [width, height]);
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const trimmedEmail = email.trim();
  const emailError = touched && (!trimmedEmail || !isValidEmail(trimmedEmail)) ? COPY.invalidEmail : '';
  const disabled = loading || !trimmedEmail || !isValidEmail(trimmedEmail) || !isOnline;

  const supportMessage = useMemo(() => {
    if (!isOnline) {
      return COPY.offline;
    }
    return '';
  }, [isOnline]);

  const handleBack = () => {
    Keyboard.dismiss();
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/login');
  };

  const handleContinue = async () => {
    setTouched(true);
    if (disabled) return;

    setLoading(true);
    router.push({
      pathname: '/create-access-key',
      params: { email: trimmedEmail, mode: 'signup' },
    });
  };

  return (
    <View style={styles.heroScreen}>
      <LoginHeroBackground />
      <View style={styles.heroContentLayer}>
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
                <AuthBrandLockup
                  title={COPY.title}
                  supporting={COPY.supporting}
                  showBrandLabel={false}
                  animateShield={false}
                  containerStyle={[styles.brandBlock, { marginBottom: layoutMetrics.brandGap }]}
                />

                <AuthFormSurface
                  showCornerAccents={false}
                  style={[styles.panel, { maxWidth: layoutMetrics.columnMaxWidth }]}
                >
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>{COPY.emailLabel}</Text>
                    <View
                      style={[
                        styles.inputShell,
                        focused ? styles.inputShellFocused : null,
                        emailError ? styles.inputShellError : null,
                      ]}
                    >
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        onFocus={() => setFocused(true)}
                        onBlur={() => {
                          setFocused(false);
                          setTouched(true);
                        }}
                        placeholder={COPY.emailPlaceholder}
                        placeholderTextColor="rgba(139,148,158,0.62)"
                        style={styles.input}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        keyboardType="email-address"
                        returnKeyType="go"
                        onSubmitEditing={() => void handleContinue()}
                        editable={!loading}
                      />
                    </View>
                    <View style={styles.fieldFeedbackSlot}>
                      {!!emailError && <Text style={styles.inlineError}>{emailError}</Text>}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, disabled ? styles.primaryButtonDisabled : null]}
                    activeOpacity={0.86}
                    disabled={disabled}
                    onPress={() => void handleContinue()}
                  >
                    {loading ? (
                      <View style={styles.primaryButtonContent}>
                        <ActivityIndicator size="small" color={ECS.bgPrimary} />
                        <Text style={styles.primaryButtonText}>{COPY.loading}</Text>
                      </View>
                    ) : (
                      <Text style={styles.primaryButtonText}>{COPY.primary}</Text>
                    )}
                  </TouchableOpacity>

                  <View style={styles.secondaryRow}>
                    <TouchableOpacity activeOpacity={0.72} onPress={handleBack}>
                      <Text style={styles.secondaryAction}>{COPY.back}</Text>
                    </TouchableOpacity>
                  </View>

                  {!!supportMessage && (
                    <View style={styles.messageRow}>
                      <AuthStatusBanner text={supportMessage} />
                    </View>
                  )}
                </AuthFormSurface>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heroScreen: { flex: 1, backgroundColor: '#040608' },
  heroContentLayer: { ...StyleSheet.absoluteFillObject },
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
    justifyContent: 'center',
  },
  inputShellFocused: {
    borderColor: AUTH_SURFACE.inputFocusedBorder,
    backgroundColor: AUTH_SURFACE.inputFocusedBackground,
  },
  inputShellError: {
    borderColor: AUTH_SURFACE.inputErrorBorder,
  },
  input: {
    fontSize: AUTH_VISUAL_SPEC.typography.inputText.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.inputText.lineHeight,
    color: TACTICAL.text,
    paddingVertical: AUTH_VISUAL_SPEC.spacing.inputTextPaddingY,
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
  messageRow: {
    marginTop: AUTH_VISUAL_SPEC.spacing.messageRowMarginTop,
  },
});
