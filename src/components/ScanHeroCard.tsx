import { JSX } from 'react';
import { Platform } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Button, Surface, Text } from '../design/openDesign';

import { useAppTheme } from '../theme/materialTheme';
import { motion } from '../theme/motion';
import { type OcrStatus, StatusChip } from './StatusChip';

type ScanHeroCardProps = {
  activeTeamName: string | null;
  failedCount: number;
  hasTeamWorkspace: boolean;
  historyLabel: string;
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
  hasTeamWorkspace,
  historyLabel,
  inFlightCount,
  onOpenCamera,
  onOpenHistory,
  savedCount,
  status
}: ScanHeroCardProps): JSX.Element {
  const theme = useAppTheme();
  const workspaceLabel = activeTeamName
    ? activeTeamName
    : hasTeamWorkspace
      ? 'Team workspace'
      : 'Personal workspace';
  const summary = `${savedCount} saved`;
  const activity = inFlightCount > 0
    ? `${inFlightCount} saving`
    : failedCount > 0
      ? `${failedCount} need retry`
      : 'All caught up';

  return (
    <Surface
      elevation={2}
      style={[
        styles.hero,
        {
          backgroundColor: theme.colors.surface
        }
      ]}
    >
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.copy}>
            <Text style={[styles.kicker, { color: theme.colors.primary }]} variant="labelSmall">
              {workspaceLabel}
            </Text>
            <Text style={styles.title} variant="headlineMedium">
              Dashboard
            </Text>
          </View>
          <StatusChip status={status} />
        </View>

        <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }} variant="bodyMedium">
          {summary} · {activity}
        </Text>

        <View style={styles.actions}>
          <MotionButton icon="camera" mode="contained" onPress={onOpenCamera} testID="dashboard-scan-button">
            Scan
          </MotionButton>
          <MotionButton icon="history" mode="outlined" onPress={onOpenHistory} testID="history-button">
            {historyLabel}
          </MotionButton>
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
    marginTop: 18
  },
  copy: {
    flex: 1
  },
  content: {
    gap: 4
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  hero: {
    borderColor: 'rgba(127, 127, 127, 0.22)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18
  },
  kicker: {
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase'
  },
  title: {
    fontFamily: Platform.select({
      android: 'serif',
      default: 'serif',
      ios: 'Iowan Old Style'
    }),
    fontSize: 34,
    lineHeight: 36
  }
});
