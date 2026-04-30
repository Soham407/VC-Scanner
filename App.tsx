import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { SUPABASE_URL } from '@env';
import { PermissionDeniedScreen } from './src/components/PermissionDeniedScreen';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    console.log('SUPABASE_URL', SUPABASE_URL);
  }, []);

  useEffect(() => {
    if (!permission) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return <PermissionDeniedScreen />;
  }

  return (
    <View style={styles.container}>
      <CameraView facing="back" style={StyleSheet.absoluteFill} testID="camera-viewfinder" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    flex: 1
  }
});
