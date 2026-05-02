import { JSX, ReactNode, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';

import { motion } from '../theme/motion';

type PageTransitionWrapperProps = {
  children: ReactNode;
  direction?: -1 | 1;
  variant?: 'container' | 'shared-axis';
};

export function PageTransitionWrapper({
  children,
  direction = 1,
  variant = 'shared-axis'
}: PageTransitionWrapperProps): JSX.Element {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(direction * 28);
  const scale = useSharedValue(variant === 'container' ? 0.94 : 1);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: motion.duration.medium2, easing: motion.easing.emphasized });
    translateX.value = withTiming(0, { duration: motion.duration.medium2, easing: motion.easing.emphasized });
    scale.value = withTiming(1, { duration: motion.duration.medium2, easing: motion.easing.emphasized });
  }, [opacity, scale, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { scale: scale.value }
    ]
  }));

  return <Animated.View style={[styles.container, animatedStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
});
