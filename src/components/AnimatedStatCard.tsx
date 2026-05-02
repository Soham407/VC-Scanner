import { JSX, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { Surface, Text } from 'react-native-paper';

import { useAppTheme } from '../theme/materialTheme';
import { motion } from '../theme/motion';

type AnimatedStatCardProps = {
  delay?: number;
  icon?: string;
  label: string;
  tone?: 'default' | 'error' | 'secondary' | 'tertiary';
  value: number;
};

function useCountUp(value: number): number {
  const [displayValue, setDisplayValue] = useState(value);
  const lastValueRef = useRef(value);

  useEffect(() => {
    const from = lastValueRef.current;
    const difference = value - from;

    if (difference === 0) {
      return;
    }

    const duration = motion.duration.medium4;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setDisplayValue(Math.round(from + difference * easedProgress));

      if (progress >= 1) {
        lastValueRef.current = value;
        setDisplayValue(value);
        clearInterval(interval);
      }
    }, 16);

    return () => {
      clearInterval(interval);
    };
  }, [value]);

  return displayValue;
}

export function AnimatedStatCard({
  delay = 0,
  label,
  tone = 'default',
  value
}: AnimatedStatCardProps): JSX.Element {
  const theme = useAppTheme();
  const displayValue = useCountUp(value);
  const pressProgress = useSharedValue(0);

  const accentColor = tone === 'error'
    ? theme.colors.error
    : tone === 'secondary'
      ? theme.colors.secondary
      : tone === 'tertiary'
        ? theme.colors.tertiary
        : theme.colors.primary;

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressProgress.value ? 0.97 : 1, motion.spring.fastEffects)
      }
    ]
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(motion.duration.medium1).easing(motion.easing.emphasized)}
      layout={LinearTransition.springify().damping(24).stiffness(300)}
      style={styles.wrap}
    >
      <Animated.View style={cardStyle}>
        <Pressable
          accessibilityRole="button"
          onPressIn={() => {
            pressProgress.value = 1;
          }}
          onPressOut={() => {
            pressProgress.value = 0;
          }}
        >
          <Surface
            elevation={1}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceContainerHigh
              }
            ]}
          >
            <Text style={{ color: accentColor }} variant="headlineSmall">
              {displayValue}
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelLarge">
              {label}
            </Text>
          </Surface>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    minHeight: 96,
    padding: 16
  },
  wrap: {
    flex: 1,
    minWidth: 132
  }
});
