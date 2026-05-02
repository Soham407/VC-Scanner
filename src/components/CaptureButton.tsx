import { JSX } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';

import { useAppTheme } from '../theme/materialTheme';
import { motion } from '../theme/motion';

type CaptureButtonProps = {
  disabled: boolean;
  onCapture: (uri: string) => void;
  takePicture: () => Promise<string | null>;
};

export function CaptureButton({ disabled, onCapture, takePicture }: CaptureButtonProps): JSX.Element {
  const theme = useAppTheme();
  const pressProgress = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(disabled ? 0.92 : pressProgress.value ? 0.9 : 1, motion.spring.fastSpatial)
      }
    ]
  }));

  const handlePress = async (): Promise<void> => {
    if (disabled) {
      return;
    }

    const uri = await takePicture();

    if (uri) {
      onCapture(uri);
    }
  };

  return (
    <Animated.View style={[styles.captureButtonAnchor, animatedStyle]}>
      <Pressable
        accessibilityLabel="Capture business card"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={16}
        onPress={() => {
          void handlePress();
        }}
        onPressIn={() => {
          pressProgress.value = 1;
        }}
        onPressOut={() => {
          pressProgress.value = 0;
        }}
        style={({ pressed }) => [
          styles.captureButton,
          {
            borderColor: pressed ? theme.colors.primary : theme.colors.outlineVariant,
            backgroundColor: pressed ? theme.colors.primaryContainer : theme.colors.surfaceContainerHigh
          },
          disabled && styles.captureButtonDisabled
        ]}
        testID="capture-button"
      >
        <View style={[styles.captureButtonInner, { backgroundColor: theme.colors.primary }]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  captureButton: {
    alignItems: 'center',
    borderRadius: 40,
    borderWidth: 5,
    height: 80,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      height: 12,
      width: 0
    },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    width: 80
  },
  captureButtonAnchor: {
    alignSelf: 'center',
    bottom: 32,
    position: 'absolute'
  },
  captureButtonDisabled: {
    opacity: 0.45
  },
  captureButtonInner: {
    borderRadius: 29,
    height: 58,
    width: 58
  }
});
