import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator as NativeActivityIndicator,
  Pressable,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  View,
  type ColorValue,
  type PressableProps,
  type StyleProp,
  type TextInputProps as NativeTextInputProps,
  type TextProps as NativeTextProps,
  type TextStyle,
  type ViewStyle
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

import { useAppTheme } from '../theme/materialTheme';

type Variant =
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  | 'displaySmall'
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  | 'labelLarge'
  | 'labelMedium'
  | 'labelSmall'
  | 'titleLarge'
  | 'titleMedium'
  | 'titleSmall';

type TextProps = NativeTextProps & {
  variant?: Variant;
};

const textVariantStyles: Record<Variant, TextStyle> = {
  bodyLarge: { fontSize: 16, lineHeight: 23 },
  bodyMedium: { fontSize: 14, lineHeight: 20 },
  bodySmall: { fontSize: 12, lineHeight: 17 },
  displaySmall: { fontFamily: 'serif', fontSize: 38, lineHeight: 42 },
  headlineLarge: { fontFamily: 'serif', fontSize: 34, lineHeight: 38 },
  headlineMedium: { fontFamily: 'serif', fontSize: 30, lineHeight: 34 },
  headlineSmall: { fontFamily: 'serif', fontSize: 24, lineHeight: 29 },
  labelLarge: { fontSize: 13, fontWeight: '800', letterSpacing: 0.35, lineHeight: 17 },
  labelMedium: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3, lineHeight: 16 },
  labelSmall: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, lineHeight: 13, textTransform: 'uppercase' },
  titleLarge: { fontFamily: 'serif', fontSize: 24, fontWeight: '600', lineHeight: 29 },
  titleMedium: { fontSize: 17, fontWeight: '800', lineHeight: 22 },
  titleSmall: { fontSize: 14, fontWeight: '800', lineHeight: 18 }
};

export function Text({ style, variant = 'bodyMedium', ...props }: TextProps): ReactElement {
  const theme = useAppTheme();

  return (
    <NativeText
      {...props}
      style={[styles.textBase, { color: theme.colors.onSurface }, textVariantStyles[variant], style]}
    />
  );
}

type SurfaceProps = ComponentProps<typeof View> & {
  elevation?: number;
};

export function Surface({ elevation = 0, style, ...props }: SurfaceProps): ReactElement {
  const theme = useAppTheme();

  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
          shadowColor: '#000000',
          shadowOffset: { height: elevation * 3, width: 0 },
          shadowOpacity: elevation > 0 ? 0.12 : 0,
          shadowRadius: elevation * 6
        },
        elevation > 0 ? { elevation } : null,
        style
      ]}
    />
  );
}

type ButtonMode = 'contained' | 'contained-tonal' | 'outlined' | 'text';

type ButtonProps = PressableProps & {
  buttonColor?: ColorValue;
  children: ReactNode;
  compact?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  icon?: string | (() => ReactElement);
  labelStyle?: StyleProp<TextStyle>;
  loading?: boolean;
  mode?: ButtonMode;
  style?: StyleProp<ViewStyle>;
  textColor?: ColorValue;
};

export function Button({
  buttonColor,
  children,
  compact,
  contentStyle,
  disabled,
  icon,
  labelStyle,
  loading,
  mode = 'text',
  style,
  textColor,
  ...props
}: ButtonProps): ReactElement {
  const theme = useAppTheme();
  const contained = mode === 'contained';
  const tonal = mode === 'contained-tonal';
  const outlined = mode === 'outlined';
  const backgroundColor = buttonColor ?? (contained ? theme.colors.onSurface : tonal ? theme.colors.surfaceContainerHighest : 'transparent');
  const color = textColor ?? (contained ? theme.colors.surface : theme.colors.onSurface);

  return (
    <Pressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      accessibilityState={{ ...props.accessibilityState, disabled: Boolean(disabled || loading) }}
      disabled={Boolean(disabled || loading)}
      style={({ pressed }) => [
        styles.button,
        compact ? styles.buttonCompact : null,
        {
          backgroundColor,
          borderColor: outlined ? theme.colors.outlineVariant : 'transparent',
          opacity: disabled ? 0.45 : pressed ? 0.78 : 1
        },
        style
      ]}
    >
      <View style={[styles.buttonContent, compact ? styles.buttonContentCompact : null, contentStyle]}>
        {loading ? (
          <NativeActivityIndicator color={color as string} size="small" />
        ) : typeof icon === 'function' ? (
          icon()
        ) : icon ? (
          <MaterialCommunityIcons color={color as string} name={icon as never} size={compact ? 16 : 18} />
        ) : null}
        <Text style={[styles.buttonLabel, { color }, labelStyle]} variant={compact ? 'labelMedium' : 'labelLarge'}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

type ChipProps = PressableProps & {
  children: ReactNode;
  compact?: boolean;
  icon?: string;
  mode?: 'flat' | 'outlined';
  style?: StyleProp<ViewStyle>;
};

export function Chip({ children, compact, icon, mode = 'flat', onPress, style, ...props }: ChipProps): ReactElement {
  const theme = useAppTheme();
  const chipContent = (
    <>
      {icon ? (
        <MaterialCommunityIcons
          color={mode === 'outlined' ? theme.colors.onSurfaceVariant : theme.colors.surface}
          name={icon as never}
          size={14}
        />
      ) : null}
      <Text
        style={{ color: mode === 'outlined' ? theme.colors.onSurfaceVariant : theme.colors.surface }}
        variant="labelSmall"
      >
        {children}
      </Text>
    </>
  );

  const chipStyle = [
    styles.chip,
    compact ? styles.chipCompact : null,
    {
      backgroundColor: mode === 'outlined' ? theme.colors.surface : theme.colors.onSurface,
      borderColor: theme.colors.outlineVariant
    },
    style
  ];

  if (!onPress) {
    return <View style={chipStyle}>{chipContent}</View>;
  }

  return (
    <Pressable
      {...props}
      onPress={onPress}
      style={({ pressed }) => [chipStyle, { opacity: pressed ? 0.75 : 1 }]}
    >
      {chipContent}
    </Pressable>
  );
}

type CardComponent = ((props: SurfaceProps & { mode?: 'outlined' | 'elevated' }) => ReactElement) & {
  Content: typeof CardContent;
  Title: typeof CardTitle;
};

function CardRoot({ mode = 'elevated', style, ...props }: SurfaceProps & { mode?: 'outlined' | 'elevated' }): ReactElement {
  const theme = useAppTheme();

  return (
    <Surface
      {...props}
      elevation={mode === 'outlined' ? 0 : 1}
      style={[
        styles.card,
        mode === 'outlined' ? { borderColor: theme.colors.outlineVariant, borderWidth: StyleSheet.hairlineWidth } : null,
        style
      ]}
    />
  );
}

function CardContent({ style, ...props }: ComponentProps<typeof View>): ReactElement {
  return <View {...props} style={[styles.cardContent, style]} />;
}

function CardTitle({ subtitle, title }: { subtitle?: string; title: string }): ReactElement {
  const theme = useAppTheme();

  return (
    <View style={styles.cardTitle}>
      <Text variant="titleMedium">{title}</Text>
      {subtitle ? (
        <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 3 }} variant="bodySmall">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export const Card = Object.assign(CardRoot, {
  Content: CardContent,
  Title: CardTitle
}) as CardComponent;

type IconButtonProps = PressableProps & {
  icon: string;
  containerColor?: string;
  iconColor?: string;
  mode?: 'contained' | 'outlined' | 'text';
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  containerColor,
  disabled,
  icon,
  iconColor,
  mode = 'text',
  size = 24,
  style,
  ...props
}: IconButtonProps): ReactElement {
  const theme = useAppTheme();

  return (
    <Pressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: containerColor ?? (mode === 'contained' ? theme.colors.surfaceContainerHighest : 'transparent'),
          borderColor: mode === 'outlined' ? theme.colors.outlineVariant : 'transparent',
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1
        },
        style
      ]}
    >
      <MaterialCommunityIcons color={iconColor ?? theme.colors.onSurface} name={icon as never} size={size} />
    </Pressable>
  );
}

export const List = {
  Icon({ color, icon }: { color?: string; icon: string }): ReactElement {
    const theme = useAppTheme();
    return <MaterialCommunityIcons color={color ?? theme.colors.onSurfaceVariant} name={icon as never} size={24} />;
  }
};

type HelperTextProps = TextProps & {
  type?: 'error' | 'info';
  visible?: boolean;
};

export function HelperText({ style, type = 'info', visible = true, ...props }: HelperTextProps): ReactElement | null {
  const theme = useAppTheme();
  if (!visible) {
    return null;
  }

  return (
    <Text
      {...props}
      style={[{ color: type === 'error' ? theme.colors.error : theme.colors.onSurfaceVariant }, style]}
      variant="bodySmall"
    />
  );
}

type TextInputProps = NativeTextInputProps & {
  label?: string;
  left?: ReactElement;
  mode?: 'flat' | 'outlined';
  outlineStyle?: StyleProp<ViewStyle>;
  right?: ReactElement;
  style?: StyleProp<TextStyle>;
};

function TextInputRoot({ label, left, outlineStyle, right, style, ...props }: TextInputProps): ReactElement {
  const theme = useAppTheme();

  return (
    <View style={[styles.inputWrap, { borderColor: theme.colors.outlineVariant }, outlineStyle]}>
      {label ? (
        <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
          {label}
        </Text>
      ) : null}
      <View style={styles.inputRow}>
        {left}
        <NativeTextInput
          {...props}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          style={[styles.input, { color: theme.colors.onSurface }, style]}
        />
        {right}
      </View>
    </View>
  );
}

function TextInputIcon({ icon, onPress }: { icon: string; onPress?: () => void }): ReactElement {
  const theme = useAppTheme();
  const iconNode = <MaterialCommunityIcons color={theme.colors.onSurfaceVariant} name={icon as never} size={20} />;

  if (!onPress) {
    return <View style={styles.inputIcon}>{iconNode}</View>;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.inputIcon}>
      {iconNode}
    </Pressable>
  );
}

export const TextInput = Object.assign(TextInputRoot, {
  Icon: TextInputIcon
});

type FABProps = PressableProps & {
  icon?: string;
  label?: string;
  mode?: string;
  style?: StyleProp<ViewStyle>;
};

export function FAB({ icon, label, mode: _mode, style, ...props }: FABProps): ReactElement {
  const theme = useAppTheme();

  return (
    <Pressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: theme.colors.onSurface, opacity: pressed ? 0.76 : 1 },
        style
      ]}
    >
      {icon ? <MaterialCommunityIcons color={theme.colors.surface} name={icon as never} size={22} /> : null}
      {label ? (
        <Text style={{ color: theme.colors.surface }} variant="labelLarge">
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

type SnackbarProps = {
  action?: {
    label: string;
    onPress: () => void;
  };
  children: ReactNode;
  onDismiss: () => void;
  duration?: number;
  testID?: string;
  visible: boolean;
};

export function Snackbar({ action, children, onDismiss, testID, visible }: SnackbarProps): ReactElement | null {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  if (!visible) {
    return null;
  }

  return (
    <View
      style={[
        styles.snackbar,
        {
          backgroundColor: theme.colors.onSurface,
          bottom: Math.max(insets.bottom, 12) + 72
        }
      ]}
      testID={testID}
    >
      <Text style={[styles.snackbarText, { color: theme.colors.surface }]} variant="bodySmall">
        {children}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            action.onPress();
            onDismiss();
          }}
        >
          <Text style={{ color: theme.colors.primary }} variant="labelLarge">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const ActivityIndicator = NativeActivityIndicator;

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48
  },
  buttonCompact: {
    minHeight: 34
  },
  buttonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  buttonContentCompact: {
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  buttonLabel: {
    textAlign: 'center'
  },
  card: {
    borderRadius: 8,
    overflow: 'hidden'
  },
  cardContent: {
    padding: 14
  },
  cardTitle: {
    paddingBottom: 8,
    paddingHorizontal: 14,
    paddingTop: 14
  },
  chip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 28,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  chipCompact: {
    minHeight: 26,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  fab: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 56,
    paddingHorizontal: 18,
    shadowColor: '#000000',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  input: {
    flex: 1,
    fontSize: 15,
    minHeight: 38,
    padding: 0
  },
  inputIcon: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 32
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  inputWrap: {
    borderBottomWidth: 1,
    gap: 4,
    minHeight: 56,
    paddingVertical: 8
  },
  snackbar: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    left: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
    right: 16,
    zIndex: 50
  },
  snackbarText: {
    flex: 1
  },
  textBase: {
    includeFontPadding: false
  }
});
