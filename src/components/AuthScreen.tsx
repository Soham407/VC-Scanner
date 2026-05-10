import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, HelperText, Surface, Text, TextInput } from '../design/openDesign';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';

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

  const redirectTo = 'vcscanner://auth/callback';
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
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password
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
            <View style={styles.hero}>
              <View style={styles.brandRow}>
                <View style={[styles.brandBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <MaterialCommunityIcons
                    color={theme.colors.onPrimaryContainer}
                    name="card-text-outline"
                    size={18}
                  />
                </View>
                <View>
                  <Text style={{ color: theme.colors.primary }} variant="labelLarge">
                    VC Scanner
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                    Capture, check, and save business cards.
                  </Text>
                </View>
              </View>

              <View style={styles.heroCopy}>
                <Text variant="headlineLarge">Turn cards into contacts.</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
                  Sign in once, scan a card, check the details, and keep the contact ready for your team.
                </Text>
              </View>

              <View style={styles.proofRow}>
                <AuthProofItem icon="auto-fix" label="Reads cards" />
                <AuthProofItem icon="cloud-check" label="Saves safely" />
                <AuthProofItem icon="account-group" label="Team ready" />
              </View>
            </View>

            <View style={[styles.form, { backgroundColor: theme.colors.surfaceContainer }]}>
                <View style={[styles.segmentRow, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
                <AuthModeButton active={mode === 'signIn'} label="Sign in" onPress={() => switchMode('signIn')} />
                <AuthModeButton
                  active={mode === 'signUp'}
                  label="Create account"
                  onPress={() => switchMode('signUp')}
                />
              </View>

              <View style={styles.inputStack}>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  label="Email"
                  mode="outlined"
                  onChangeText={setEmail}
                  placeholder="name@company.com"
                  left={<TextInput.Icon icon="email-outline" />}
                  value={email}
                />

                <TextInput
                  autoCapitalize="none"
                  autoComplete="password"
                  label="Password"
                  mode="outlined"
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  right={(
                    <TextInput.Icon
                      icon={isPasswordHidden ? 'eye-off-outline' : 'eye-outline'}
                      onPress={() => setIsPasswordHidden((current) => !current)}
                    />
                  )}
                  secureTextEntry={isPasswordHidden}
                  left={<TextInput.Icon icon="lock-outline" />}
                  value={password}
                />

                {mode === 'signUp' ? (
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="password"
                    label="Confirm password"
                    mode="outlined"
                    onChangeText={setConfirmPassword}
                    placeholder="••••••••"
                    right={(
                      <TextInput.Icon
                        icon={isConfirmPasswordHidden ? 'eye-off-outline' : 'eye-outline'}
                        onPress={() => setIsConfirmPasswordHidden((current) => !current)}
                      />
                    )}
                    secureTextEntry={isConfirmPasswordHidden}
                    left={<TextInput.Icon icon="lock-check-outline" />}
                    value={confirmPassword}
                  />
                ) : null}
              </View>

              {mode === 'signUp' ? (
                <Text style={{ color: isSignUpPasswordMismatch ? theme.colors.error : theme.colors.onSurfaceVariant }} variant="labelMedium">
                  {isSignUpPasswordMismatch
                    ? 'Passwords do not match.'
                    : 'Use the same password twice to avoid a typo during account creation.'}
                </Text>
              ) : (
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                  Tip: use the email address you want linked to your saved cards.
                </Text>
              )}

              {errorMessage ? (
                <View style={[styles.errorBanner, { backgroundColor: theme.colors.errorContainer }]}>
                  <MaterialCommunityIcons color={theme.colors.onErrorContainer} name="alert-circle-outline" size={18} />
                  <Text style={{ color: theme.colors.onErrorContainer, flex: 1 }} variant="bodySmall">
                    {errorMessage}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                  Use your demo account, then scan your first card to see the full flow.
                </Text>
              )}

              <View style={styles.inlineActions}>
                <Button
                  compact
                  disabled={isSubmitting || isResettingPassword}
                  loading={isResettingPassword}
                  mode="text"
                  onPress={() => {
                    void handleForgotPassword();
                  }}
                >
                  Forgot password?
                </Button>
                <Button
                  compact
                  mode="text"
                  onPress={() => {
                    switchMode(mode === 'signIn' ? 'signUp' : 'signIn');
                  }}
                >
                  {mode === 'signIn' ? 'Need an account?' : 'Already have one?'}
                </Button>
              </View>

              <View style={styles.actions}>
                <Button
                  contentStyle={styles.buttonContent}
                  disabled={isSubmitting || isResettingPassword}
                  loading={isSubmitting}
                  mode="contained"
                  onPress={handlePasswordAuth}
                  style={styles.primaryAction}
                >
                  {mode === 'signUp' ? 'Create account' : 'Sign in'}
                </Button>

                <Button
                  icon={() => (
                    <View style={styles.googleLogoWrap}>
                      <MaterialCommunityIcons color="#4285F4" name="google" size={18} />
                    </View>
                  )}
                  contentStyle={styles.buttonContent}
                  disabled={isSubmitting || isResettingPassword}
                  loading={isSubmitting}
                  mode="contained-tonal"
                  onPress={handleGoogleAuth}
                >
                  Continue with Google
                </Button>
              </View>
            </View>
          </Surface>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthModeButton({
  active,
  label,
  onPress
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const pressProgress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressProgress.value ? 0.98 : 1, motion.spring.fastEffects)
      }
    ]
  }));

  return (
    <Animated.View style={[styles.segmentButtonWrap, animatedStyle]}>
      <Button
        compact
        mode={active ? 'contained' : 'text'}
        onPress={onPress}
        onPressIn={() => {
          pressProgress.value = 1;
        }}
        onPressOut={() => {
          pressProgress.value = 0;
        }}
        style={styles.segmentButton}
      >
        {label}
      </Button>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12
  },
  buttonContent: {
    paddingVertical: 6
  },
  errorBanner: {
    alignItems: 'flex-start',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  form: {
    borderRadius: 28,
    gap: 16,
    padding: 18
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16
  },
  googleLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandBadge: {
    alignItems: 'center',
    borderRadius: 10,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  frame: {
    alignSelf: 'center',
    maxWidth: 560,
    width: '100%'
  },
  heroCopy: {
    gap: 10
  },
  hero: {
    gap: 18,
    padding: 18,
    paddingBottom: 20
  },
  inputStack: {
    gap: 12
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: -4
  },
  panel: {
    borderRadius: 32,
    gap: 0
  },
  segmentButton: {
    flex: 1
  },
  segmentButtonWrap: {
    flex: 1
  },
  segmentRow: {
    borderRadius: 20,
    flexDirection: 'row',
    gap: 8,
    padding: 4
  },
  proofRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  proofPill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  primaryAction: {
    marginTop: 2
  }
});

function AuthProofItem({
  icon,
  label
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.proofPill, { backgroundColor: theme.colors.surfaceContainer }]}>
      <MaterialCommunityIcons color={theme.colors.primary} name={icon} size={16} />
      <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelLarge">
        {label}
      </Text>
    </View>
  );
}
