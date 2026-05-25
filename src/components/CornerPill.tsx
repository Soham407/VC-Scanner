import { JSX } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { Chip } from '../design/openDesign';

import { motion } from '../theme/motion';

type CornerPillProps = {
  count: number;
  onPress: () => void;
};

export function CornerPill({ count, onPress }: CornerPillProps): JSX.Element | null {
  if (count <= 0) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.duration.medium1).easing(motion.easing.emphasized)}
      exiting={FadeOutUp.duration(motion.duration.short4).easing(motion.easing.emphasizedExit)}
      style={styles.pill}
    >
      <Animated.View layout={LinearTransition.springify().damping(18).stiffness(420)}>
        <Chip
          accessibilityLabel={`${count} card${count === 1 ? '' : 's'} saving`}
          compact
          icon="cloud-sync"
          mode="flat"
          onPress={onPress}
          testID="saving-pill"
        >
          {`Saving ${count}`}
        </Chip>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    right: 16,
    top: 56,
    zIndex: 10
  }
});
