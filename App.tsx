import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { SUPABASE_URL } from '@env';
import { BlurryImageError, extractText } from './lib/ocr';
import { CaptureButton } from './src/components/CaptureButton';
import { PermissionDeniedScreen } from './src/components/PermissionDeniedScreen';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const captureLockRef = useRef(false);

  useEffect(() => {
    console.log('SUPABASE_URL', SUPABASE_URL);
  }, []);

  useEffect(() => {
    if (!permission) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!previewUri) {
      return;
    }

    const dismissPreviewTimer = setTimeout(() => {
      setPreviewUri(null);
    }, 500);

    return () => {
      clearTimeout(dismissPreviewTimer);
    };
  }, [previewUri]);

  const handleTakePicture = useCallback(async (): Promise<string | null> => {
    if (captureLockRef.current) {
      return null;
    }

    captureLockRef.current = true;
    setIsCapturing(true);

    try {
      const capturedPhoto = await cameraRef.current?.takePictureAsync({
        quality: 0.7,
        skipProcessing: true
      });

      return capturedPhoto?.uri ?? null;
    } finally {
      captureLockRef.current = false;
      setIsCapturing(false);
    }
  }, []);

  const handleCapture = useCallback((uri: string): void => {
    setPreviewUri(uri);

    void (async () => {
      try {
        const extractedText = await extractText(uri);

        if (__DEV__) {
          Alert.alert('OCR text', extractedText);
        }
      } catch (error) {
        if (error instanceof BlurryImageError) {
          setPreviewUri(null);
          Alert.alert('Image too blurry, retake');
          return;
        }

        console.error('OCR extraction failed', error);
      }
    })();
  }, []);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return <PermissionDeniedScreen />;
  }

  return (
    <View style={styles.container}>
      {previewUri ? (
        <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} testID="capture-preview" />
      ) : (
        <>
          <CameraView
            facing="back"
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            testID="camera-viewfinder"
          />
          <CaptureButton disabled={isCapturing} onCapture={handleCapture} takePicture={handleTakePicture} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    flex: 1
  }
});
