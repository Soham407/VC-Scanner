import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Surface, Text, TextInput } from '../design/openDesign';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppLogo } from './AppLogo';
import { createAuthRedirectUrl } from '../lib/authRedirect';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '../theme/materialTheme';
import { motion } from '../theme/motion';

type AuthMode = 'signIn' | 'signUp';

function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return 'Authentication failed';
}

async function signInWithGoogle(redirectTo: string): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    options: {
      redirectTo,
      skipBrowserRedirect: true
    },
    provider: 'google'
  });

  if (error) {
    throw error;
  }

  if (!data.url) {
    throw new Error('Missing Google sign-in URL');
  }

  await Linking.openURL(data.url);
}

export function AuthScreen() {
  const theme = useAppTheme();
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordHidden, setIsPasswordHidden] = useState(true);
  const [isConfirmPasswordHidden, setIsConfirmPasswordHidden] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSignUpPasswordMismatch = mode === 'signUp' && confirmPassword.length > 0 && password !== confirmPassword;

  const switchMode = (nextMode: AuthMode): void => {
    setMode(nextMode);
    setErrorMessage(null);
    setConfirmPassword('');
    setIsConfirmPasswordHidden(true);
  };

  const handlePasswordAuth = async (): Promise<void> => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage('Enter an email and password.');
      return;
    }

    if (mode === 'signUp' && password.length < 6) {
      setErrorMessage('Use a password with at least 6 characters.');
      return;
    }

    if (mode === 'signUp' && password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (mode === 'signUp') {
        const redirectTo = await createAuthRedirectUrl('email');
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: redirectTo
          }
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          Alert.alert('Check your inbox', 'Verify your email address to finish creating the account.');
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (): Promise<void> => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setErrorMessage('Enter your email first, then request a reset link.');
      return;
    }

    setIsResettingPassword(true);
    setErrorMessage(null);

    try {
      const redirectTo = await createAuthRedirectUrl('recovery');
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo
      });

      if (error) {
        throw error;
      }

      Alert.alert(
        'Reset link sent',
        'If that email exists, you will receive a password reset link. Open it on this device to set a new password.'
      );
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleGoogleAuth = async (): Promise<void> => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const redirectTo = await createAuthRedirectUrl('oauth');
      await signInWithGoogle(redirectTo);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(motion.duration.medium2).easing(motion.easing.emphasized)} style={styles.frame}>
          <Surface elevation={2} style={[styles.panel, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
            <View style={[styles.form, { backgroundColor: theme.colors.surfaceContainer }]}>
              <View style={styles.header}>
                <AppLogo compact size={72} style={styles.logo} />
                <Text style={styles.title} variant="headlineMedium">
                  Welcome back
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyLarge">
                  Let's get you started.
                </Text>
              </View>

              <View style={styles.inputStack}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel} variant="bodyMedium">
                    Email
                  </Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    outlineStyle={[styles.inputBox, { borderColor: theme.colors.outlineVariant }]}
                    placeholder="example@gmail.com"
                    value={email}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <View style={styles.passwordLabelRow}>
                    <Text style={styles.fieldLabel} variant="bodyMedium">
                      Password
                    </Text>
                    {mode === 'signIn' ? (
                      <Button
                        compact
                        disabled={isSubmitting || isResettingPassword}
                        loading={isResettingPassword}
                        mode="text"
                        onPress={() => {
                          void handleForgotPassword();
                        }}
                        style={styles.inlineTextButton}
                      >
                        Forgot Password ?
                      </Button>
                    ) : null}
                  </View>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="password"
                    onChangeText={setPassword}
                    outlineStyle={[styles.inputBox, { borderColor: theme.colors.outlineVariant }]}
                    placeholder="••••••••"
                    right={(
                      <TextInput.Icon
                        icon={isPasswordHidden ? 'eye-off-outline' : 'eye-outline'}
                        onPress={() => setIsPasswordHidden((current) => !current)}
                      />
                    )}
                    secureTextEntry={isPasswordHidden}
                    value={password}
                  />
                </View>

                {mode === 'signUp' ? (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel} variant="bodyMedium">
                      Confirm password
                    </Text>
                    <TextInput
                      autoCapitalize="none"
                      autoComplete="password"
                      onChangeText={setConfirmPassword}
                      outlineStyle={[styles.inputBox, { borderColor: theme.colors.outlineVariant }]}
                      placeholder="••••••••"
                      right={(
                        <TextInput.Icon
                          icon={isConfirmPasswordHidden ? 'eye-off-outline' : 'eye-outline'}
                          onPress={() => setIsConfirmPasswordHidden((current) => !current)}
                        />
                      )}
                      secureTextEntry={isConfirmPasswordHidden}
                      value={confirmPassword}
                    />
                  </View>
                ) : null}
              </View>

              {mode === 'signUp' ? (
                <Text style={{ color: isSignUpPasswordMismatch ? theme.colors.error : theme.colors.onSurfaceVariant }} variant="labelMedium">
                  {isSignUpPasswordMismatch
                    ? 'Passwords do not match.'
                    : 'Use the same password twice to avoid a typo during account creation.'}
                </Text>
              ) : null}

              {errorMessage ? (
                <View style={[styles.errorBanner, { backgroundColor: theme.colors.errorContainer }]}>
                  <MaterialCommunityIcons color={theme.colors.onErrorContainer} name="alert-circle-outline" size={18} />
                  <Text style={{ color: theme.colors.onErrorContainer, flex: 1 }} variant="bodySmall">
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Button
                  buttonColor={theme.colors.primary}
                  contentStyle={styles.buttonContent}
                  disabled={isSubmitting || isResettingPassword}
                  labelStyle={styles.primaryActionLabel}
                  loading={isSubmitting}
                  mode="contained"
                  onPress={handlePasswordAuth}
                  textColor={theme.colors.surface}
                  style={styles.primaryAction}
                >
                  {mode === 'signUp' ? 'Create account' : 'Login'}
                </Button>

                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: theme.colors.outlineVariant }]} />
                  <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
                    Or
                  </Text>
                  <View style={[styles.dividerLine, { backgroundColor: theme.colors.outlineVariant }]} />
                </View>

                <Button
                  icon={() => (
                    <View style={styles.googleLogoWrap}>
                      <MaterialCommunityIcons color="#4285F4" name="google" size={18} />
                    </View>
                  )}
                  contentStyle={styles.buttonContent}
                  disabled={isSubmitting || isResettingPassword}
                  loading={isSubmitting}
                  mode="outlined"
                  onPress={handleGoogleAuth}
                  style={styles.googleAction}
                  textColor={theme.colors.onSurface}
                >
                  Login with google
                </Button>
              </View>

              <View style={styles.accountRow}>
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
                  {mode === 'signIn' ? "Don't have an account ?" : 'Already have an account ?'}
                </Text>
                <Button
                  compact
                  labelStyle={[styles.accountActionLabel, { color: theme.colors.primary }]}
                  mode="text"
                  onPress={() => {
                    switchMode(mode === 'signIn' ? 'signUp' : 'signIn');
                  }}
                  style={styles.accountAction}
                >
                  {mode === 'signIn' ? 'Sign Up' : 'Login'}
                </Button>
              </View>
            </View>
          </Surface>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  accountAction: {
    minHeight: 28
  },
  accountActionLabel: {
    fontSize: 14
  },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center'
  },
  actions: {
    gap: 14
  },
  buttonContent: {
    minHeight: 44,
    paddingVertical: 6
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8
  },
  errorBanner: {
    alignItems: 'flex-start',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  fieldGroup: {
    gap: 8
  },
  fieldLabel: {
    fontWeight: '500'
  },
  form: {
    gap: 20,
    padding: 24,
    paddingBottom: 28,
    paddingTop: 52
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20
  },
  googleLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  googleAction: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8DEE4',
    borderRadius: 8
  },
  header: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 24
  },
  frame: {
    alignSelf: 'center',
    maxWidth: 430,
    width: '100%'
  },
  inputStack: {
    gap: 18
  },
  inlineTextButton: {
    minHeight: 24
  },
  inputBox: {
    borderBottomWidth: 1,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 58,
    paddingHorizontal: 20,
    paddingVertical: 8
  },
  panel: {
    borderRadius: 36,
    gap: 0,
    overflow: 'hidden'
  },
  passwordLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  primaryAction: {
    borderRadius: 8,
    marginTop: 2
  },
  primaryActionLabel: {
    fontSize: 16,
    fontWeight: '800'
  },
  title: {
    fontFamily: undefined,
    fontWeight: '800'
  },
  logo: {
    marginBottom: 8
  }
});
