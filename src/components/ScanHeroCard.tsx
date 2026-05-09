import { JSX } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Button, Surface, Text } from 'react-native-paper';

import { useAppTheme } from '../theme/materialTheme';
import { motion } from '../theme/motion';
import { type OcrStatus, StatusChip } from './StatusChip';

type ScanHeroCardProps = {
  activeTeamName: string | null;
  failedCount: number;
  inFlightCount: number;
  savedCount: number;
  status: OcrStatus;
  onOpenCamera: () => void;
  onOpenHistory: () => void;
};

function MotionButton({
  icon,
  mode,
  onPress,
  testID,
  children
}: {
  children: string;
  icon: string;
  mode: 'contained' | 'outlined';
  onPress: () => void;
  testID: string;
}): JSX.Element {
  const pressProgress = useSharedValue(0);
  const buttonStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressProgress.value ? 0.96 : 1, motion.spring.fastEffects)
      }
    ]
  }));

  return (
    <Animated.View style={buttonStyle}>
      <Button
        icon={icon}
        mode={mode}
        onPress={onPress}
        onPressIn={() => {
          pressProgress.value = 1;
        }}
        onPressOut={() => {
          pressProgress.value = 0;
        }}
        testID={testID}
      >
        {children}
      </Button>
    </Animated.View>
  );
}

export function ScanHeroCard({
  activeTeamName,
  failedCount,
  inFlightCount,
  onOpenCamera,
  onOpenHistory,
  savedCount,
  status
}: ScanHeroCardProps): JSX.Element {
  const theme = useAppTheme();

  return (
    <Surface
      elevation={2}
      style={[
        styles.hero,
        {
          backgroundColor: theme.colors.surfaceContainerHigh
        }
      ]}
    >
      <View style={styles.content}>
        <View style={styles.copy}>
          <Text style={[styles.kicker, { color: theme.colors.primary }]} variant="labelSmall">
            {activeTeamName ? `${activeTeamName} · active Team` : 'No active Team'}
          </Text>
          <Text style={styles.title} variant="headlineMedium">
            Scan card
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
            Capture now. Assign after. Every card is saved into the active Team before Workers see it.
          </Text>
          <View style={styles.actions}>
            <MotionButton icon="camera" mode="contained" onPress={onOpenCamera} testID="dashboard-scan-button">
              Confirm Team and capture
            </MotionButton>
            <MotionButton icon="history" mode="outlined" onPress={onOpenHistory} testID="history-button">
              Team Inbox
            </MotionButton>
          </View>
        </View>
        <View style={styles.summaryWrap}>
          <StatusChip status={status} />
          <View style={[styles.summaryPanel, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelLarge">
              Saved
            </Text>
            <Text style={{ color: theme.colors.primary }} variant="displaySmall">
              {savedCount}
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
              cards stored
            </Text>
          </View>
          <View style={styles.summaryStack}>
            <View style={[styles.summaryRow, { backgroundColor: theme.colors.surfaceContainer }]}>
              <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                Saving
              </Text>
              <Text style={{ color: theme.colors.secondary }} variant="titleMedium">
                {inFlightCount}
              </Text>
            </View>
            <View style={[styles.summaryRow, { backgroundColor: theme.colors.surfaceContainer }]}>
              <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                Retry
              </Text>
              <Text style={{ color: theme.colors.error }} variant="titleMedium">
                {failedCount}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 20
  },
  copy: {
    flex: 1
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18
  },
  hero: {
    borderRadius: 8,
    padding: 20
  },
  kicker: {
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase'
  },
  summaryPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 4,
    minWidth: 112,
    paddingHorizontal: 16,
    paddingVertical: 18
  },
  summaryRow: {
    alignItems: 'center',
    borderRadius: 8,
    gap: 2,
    minWidth: 84,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  summaryStack: {
    gap: 10
  },
  summaryWrap: {
    gap: 10
  },
  title: {
    marginTop: 14
  }
});
