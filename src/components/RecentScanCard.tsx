import { JSX } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { Surface, Text } from '../design/openDesign';

import type { ScannerHistoryItem } from '../../store/scanner';
import { useAppTheme } from '../theme/materialTheme';
import { motion } from '../theme/motion';
import { StatusChip } from './StatusChip';

function getLeadTitle(item: ScannerHistoryItem): string {
  return item.parsed.fullName ?? item.parsed.companyName ?? item.rawText.split('\n')[0] ?? 'Untitled scan';
}

function getLeadSubtitle(item: ScannerHistoryItem): string {
  return item.parsed.companyName ?? item.parsed.jobTitle ?? item.parsed.email ?? item.id;
}

export function RecentScanCard({
  item,
  onPress
}: {
  item: ScannerHistoryItem;
  onPress?: () => void;
}): JSX.Element {
  const theme = useAppTheme();
  const pressProgress = useSharedValue(0);
  const savedAt = new Date(item.savedAt);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressProgress.value ? 0.985 : 1, motion.spring.fastEffects)
      }
    ]
  }));

  return (
    <Animated.View layout={LinearTransition.springify().damping(24).stiffness(300)} style={styles.wrap}>
      <Animated.View style={cardStyle}>
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
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
                backgroundColor: theme.colors.surfaceContainer
              }
            ]}
            testID={`history-${item.id}`}
          >
            <Image source={{ uri: item.imagePath }} style={styles.thumb} />
            <View style={styles.meta}>
              <Text numberOfLines={1} variant="titleMedium">
                {getLeadTitle(item)}
              </Text>
              <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
                {getLeadSubtitle(item)}
              </Text>
              <View style={styles.metaFooter}>
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                  Saved {savedAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
                  {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
            <View style={styles.side}>
              <StatusChip status={item.parseStatus === 'parsed' ? 'parsed' : 'idle'} />
            </View>
          </Surface>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderColor: 'rgba(127, 127, 127, 0.22)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    padding: 12
  },
  meta: {
    flex: 1
  },
  metaFooter: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6
  },
  side: {
    alignItems: 'flex-end',
    justifyContent: 'space-between'
  },
  wrap: {
    alignSelf: 'stretch'
  },
  thumb: {
    borderRadius: 8,
    height: 52,
    width: 52
  }
});
