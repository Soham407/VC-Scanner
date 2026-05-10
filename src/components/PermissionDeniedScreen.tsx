import { JSX } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Surface, Text } from '../design/openDesign';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../theme/materialTheme';

export function PermissionDeniedScreen(): JSX.Element {
  const theme = useAppTheme();

  const handleOpenSettings = (): void => {
    void Linking.openSettings();
  };

  return (
    <Surface style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface elevation={2} style={[styles.card, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.primaryContainer }]}>
          <MaterialCommunityIcons color={theme.colors.onPrimaryContainer} name="camera-off" size={28} />
        </View>
        <Text style={styles.title} variant="headlineSmall">
          Camera permission needed
        </Text>
        <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]} variant="bodyLarge">
          Camera access is required to scan business cards. The app only uses the camera while you are actively capturing.
        </Text>
        <View style={styles.hintList}>
          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
            1. Open Settings
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
            2. Allow camera access
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
            3. Return and scan
          </Text>
        </View>
        <Button icon="cog" mode="contained" onPress={handleOpenSettings}>
          Open Settings
        </Button>
      </Surface>
    </Surface>
  );
}

const styles = StyleSheet.create({
  body: {
    marginBottom: 24,
    maxWidth: 320,
    textAlign: 'center'
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  card: {
    borderRadius: 8,
    maxWidth: 420,
    padding: 20,
    width: '100%'
  },
  hintList: {
    gap: 4,
    marginBottom: 24
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 8,
    height: 60,
    justifyContent: 'center',
    marginBottom: 16,
    width: 60
  },
  title: {
    marginBottom: 12,
    textAlign: 'center'
  }
});
