import { JSX } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '../design/openDesign';
import { useAppTheme } from '../theme/materialTheme';

type AppLogoProps = {
  compact?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  variant?: 'inline' | 'mark' | 'stack';
};

export function AppLogo({ compact, size = 72, style, variant = 'stack' }: AppLogoProps): JSX.Element {
  const theme = useAppTheme();
  const markSize = size;
  const ringOuterSize = Math.round(size * 0.7);
  const ringInnerSize = Math.round(size * 0.46);
  const cardWidth = Math.round(size * 0.47);
  const cardHeight = Math.round(size * 0.32);

  const inlineLayout = variant === 'inline';

  return (
    <View
      style={[
        styles.root,
        inlineLayout ? styles.inlineRoot : styles.stackRoot,
        style
      ]}
    >
      <View
        style={[
          styles.markShell,
          {
            backgroundColor: theme.colors.surfaceContainerHighest,
            borderColor: theme.colors.outlineVariant,
            height: markSize,
            width: markSize
          }
        ]}
      >
        <View
          style={[
            styles.ring,
            {
              borderColor: theme.colors.secondary,
              height: ringOuterSize,
              width: ringOuterSize
            }
          ]}
        />
        <View
          style={[
            styles.ring,
            {
              borderColor: theme.colors.primary,
              height: ringInnerSize,
              width: ringInnerSize
            }
          ]}
        />
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
              height: cardHeight,
              width: cardWidth
            }
          ]}
        >
          <View
            style={[
              styles.cardAccent,
              {
                backgroundColor: theme.colors.primary
              }
            ]}
          />
          <View
            style={[
              styles.cardLine,
              {
                backgroundColor: theme.colors.onSurfaceVariant,
                width: Math.round(cardWidth * 0.48)
              }
            ]}
          />
          <View
            style={[
              styles.cardLineShort,
              {
                backgroundColor: theme.colors.tertiary,
                width: Math.round(cardWidth * 0.28)
              }
            ]}
          />
        </View>
        <View
          style={[
            styles.spark,
            {
              backgroundColor: theme.colors.tertiary
            }
          ]}
        />
      </View>

      {variant !== 'mark' ? (
        <View style={inlineLayout ? styles.inlineWordmark : styles.stackWordmark}>
          <Text style={[styles.wordmark, { color: theme.colors.onSurface }]} variant={compact ? 'titleMedium' : 'headlineSmall'}>
            VC Scanner
          </Text>
          {!compact ? (
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
              Scan and store cards.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 10,
    position: 'absolute',
    right: '9%',
    top: '15%',
    transform: [{ rotate: '-10deg' }]
  },
  cardAccent: {
    borderRadius: 999,
    height: 16,
    marginBottom: 5,
    width: 4
  },
  cardLine: {
    borderRadius: 999,
    height: 3,
    marginBottom: 4
  },
  cardLineShort: {
    borderRadius: 999,
    height: 3
  },
  inlineRoot: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14
  },
  inlineWordmark: {
    flexShrink: 1
  },
  markShell: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden'
  },
  root: {
    flexShrink: 1
  },
  ring: {
    borderRadius: 999,
    borderWidth: 2,
    opacity: 0.85,
    position: 'absolute'
  },
  spark: {
    borderRadius: 999,
    height: 9,
    position: 'absolute',
    right: '20%',
    top: '18%',
    width: 9
  },
  stackRoot: {
    alignItems: 'center',
    gap: 12
  },
  stackWordmark: {
    alignItems: 'center',
    gap: 2
  },
  wordmark: {
    fontWeight: '800',
    textAlign: 'center'
  }
});
