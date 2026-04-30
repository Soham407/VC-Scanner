import { JSX } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

export function PermissionDeniedScreen(): JSX.Element {
  const handleOpenSettings = (): void => {
    void Linking.openSettings();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Camera Permission Needed</Text>
      <Text style={styles.body}>
        Camera access is required to scan business cards. Enable camera access in your device
        settings to continue.
      </Text>
      <Pressable onPress={handleOpenSettings} style={styles.button}>
        <Text style={styles.buttonLabel}>Open Settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#4b5563',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center'
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 8,
    minWidth: 160,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center'
  }
});
