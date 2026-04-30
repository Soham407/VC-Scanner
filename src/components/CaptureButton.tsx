import { JSX } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

type CaptureButtonProps = {
  disabled: boolean;
  onCapture: (uri: string) => void;
  takePicture: () => Promise<string | null>;
};

export function CaptureButton({ disabled, onCapture, takePicture }: CaptureButtonProps): JSX.Element {
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
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={16}
      onPress={() => {
        void handlePress();
      }}
      style={[styles.captureButton, disabled && styles.captureButtonDisabled]}
      testID="capture-button"
    >
      <View style={styles.captureButtonInner} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  captureButton: {
    alignItems: 'center',
    borderColor: '#ffffff',
    borderRadius: 36,
    borderWidth: 4,
    bottom: 32,
    height: 72,
    justifyContent: 'center',
    position: 'absolute',
    width: 72
  },
  captureButtonDisabled: {
    opacity: 0.45
  },
  captureButtonInner: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    height: 56,
    width: 56
  }
});
