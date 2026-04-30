import { JSX } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

type CornerPillProps = {
  count: number;
  onPress: () => void;
};

export function CornerPill({ count, onPress }: CornerPillProps): JSX.Element | null {
  if (count <= 0) {
    return null;
  }

  return (
    <Pressable onPress={onPress} style={styles.pill} testID="saving-pill">
      <Text style={styles.text}>{`Saving ${count}...`}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    right: 16,
    top: 56,
    zIndex: 10
  },
  text: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  }
});
