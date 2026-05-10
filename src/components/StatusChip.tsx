import { JSX, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';
import { Text } from '../design/openDesign';

import { useAppTheme } from '../theme/materialTheme';
import { motion } from '../theme/motion';

export type OcrStatus = 'idle' | 'scanning' | 'saving' | 'parsed' | 'failed';

const statusCopy: Record<OcrStatus, { label: string; tone: 'error' | 'primary' | 'secondary' | 'tertiary' }> = {
  failed: { label: 'Needs retry', tone: 'error' },
  idle: { label: 'Ready', tone: 'primary' },
  parsed: { label: 'Saved', tone: 'tertiary' },
  saving: { label: 'Saving', tone: 'secondary' },
  scanning: { label: 'Scanning', tone: 'primary' }
};

export function StatusChip({ status }: { status: OcrStatus }): JSX.Element {
  const theme = useAppTheme();
  const pulse = useSharedValue(1);
  const copy = statusCopy[status];
  const isActive = status === 'scanning' || status === 'saving';

  useEffect(() => {
    pulse.value = isActive
      ? withRepeat(
        withSequence(
          withTiming(1.18, { duration: motion.duration.medium2, easing: motion.easing.standard }),
          withTiming(1, { duration: motion.duration.medium2, easing: motion.easing.standard })
        ),
        -1,
        true
      )
      : withTiming(1, { duration: motion.duration.short4, easing: motion.easing.standard });
  }, [isActive, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }]
  }));

  const accent = copy.tone === 'error'
    ? theme.colors.error
    : copy.tone === 'secondary'
      ? theme.colors.secondary
      : copy.tone === 'tertiary'
        ? theme.colors.tertiary
        : theme.colors.primary;

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: status === 'failed' ? theme.colors.errorContainer : theme.colors.secondaryContainer
        }
      ]}
    >
      <Animated.View style={[styles.dot, { backgroundColor: accent }, dotStyle]} />
      <Text
        style={{
          color: status === 'failed' ? theme.colors.onErrorContainer : theme.colors.onSecondaryContainer
        }}
        variant="labelLarge"
      >
        {copy.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    minHeight: 28,
    paddingHorizontal: 9
  },
  dot: {
    borderRadius: 5,
    height: 10,
    width: 10
  }
});
