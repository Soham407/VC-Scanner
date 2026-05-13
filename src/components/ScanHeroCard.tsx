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
          <View style={styles.kickerRow}>
            <Text style={[styles.kicker, { color: theme.colors.primary }]} variant="labelSmall">
              {activeTeamName ? `${activeTeamName} · company team` : hasTeamWorkspace ? 'No team set' : 'Personal scans'}
            </Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
                  Capture
                </Text>
              </View>
              <StatusChip status={status} />
            </View>
          </View>
          <Text style={styles.title} variant="headlineMedium">
            Scan a business card
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
            {activeTeamName
              ? 'Take a photo, check the details, and save the card to the team inbox.'
              : 'Take a photo, check the details, and save the card to your account.'}
          </Text>
          {activeTeamName ? (
            <View style={[styles.alert, { backgroundColor: theme.colors.surfaceContainer }]}>
              <Text style={{ color: theme.colors.onSurface }} variant="labelLarge">
                New cards stay in the team inbox first.
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} variant="bodySmall">
                Team Leaders can review and assign them when ready.
              </Text>
            </View>
          ) : null}
          <View style={styles.pipelineRow}>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
              {savedCount} saved
            </Text>
            <View style={[styles.pipelineDot, { backgroundColor: theme.colors.outlineVariant }]} />
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
              {inFlightCount} saving
            </Text>
            <View style={[styles.pipelineDot, { backgroundColor: theme.colors.outlineVariant }]} />
            <Text style={{ color: failedCount > 0 ? theme.colors.error : theme.colors.onSurfaceVariant }} variant="labelMedium">
              {failedCount} needs retry
            </Text>
          </View>
          <View style={styles.actions}>
            <MotionButton icon="camera" mode="contained" onPress={onOpenCamera} testID="dashboard-scan-button">
              Scan now
            </MotionButton>
            <MotionButton icon="history" mode="outlined" onPress={onOpenHistory} testID="history-button">
              {`View ${historyLabel.toLowerCase()}`}
            </MotionButton>
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
    marginTop: 18
  },
  alert: {
    borderRadius: 8,
    gap: 2,
    marginTop: 16,
    padding: 14
  },
  copy: {
    flex: 1
  },
  content: {
    alignItems: 'flex-start',
    flexDirection: 'row'
  },
  hero: {
    borderColor: 'rgba(127, 127, 127, 0.22)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18
  },
  kickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  kicker: {
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase'
  },
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8
  },
  title: {
    fontFamily: Platform.select({
      android: 'serif',
      default: 'serif',
      ios: 'Iowan Old Style'
    }),
    fontSize: 30,
    lineHeight: 32,
    marginTop: 14
  },
  pipelineDot: {
    borderRadius: 2,
    height: 4,
    width: 4
  },
  pipelineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14
  }
});
