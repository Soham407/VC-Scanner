import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, View } from 'react-native';

import { BlurryImageError, extractText } from './lib/ocr';
import { CaptureButton } from './src/components/CaptureButton';
import { DevImageUploadSurface } from './src/components/DevImageUploadSurface';
import { PermissionDeniedScreen } from './src/components/PermissionDeniedScreen';
import { prepareImage } from './src/lib/imagePrep';
import { invokeScanCard, ScanCardInvokeError } from './src/lib/scanCard';
import { uploadCardImage } from './src/lib/upload';

function createUuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === 'function') {
    return randomUuid.call(globalThis.crypto);
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const captureLockRef = useRef(false);

  useEffect(() => {
    if (!permission) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

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
    setIsProcessing(true);

    void (async () => {
      try {
        const leadId = createUuid();
        const { cachePath } = await prepareImage(uri);
        const rawText = await extractText(cachePath);
        const imagePath = await uploadCardImage(cachePath, leadId);

        await invokeScanCard({
          imagePath,
          leadId,
          rawText
        });
      } catch (error) {
        if (error instanceof BlurryImageError) {
          Alert.alert('Image too blurry, retake');
          return;
        }

        if (error instanceof ScanCardInvokeError) {
          Alert.alert('Scan failed', error.message);
          return;
        }

        console.error('Capture pipeline failed', error);
        Alert.alert('Scan failed', 'Please try again');
      } finally {
        setIsProcessing(false);
        setPreviewUri(null);
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
        <View style={StyleSheet.absoluteFill}>
          <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} testID="capture-preview" />
          {isProcessing ? (
            <View style={styles.processingOverlay}>
              <ActivityIndicator color="#ffffff" size="large" testID="pipeline-spinner" />
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <CameraView
            facing="back"
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            testID="camera-viewfinder"
          />
          {__DEV__ ? <DevImageUploadSurface /> : null}
          <CaptureButton disabled={isCapturing || isProcessing} onCapture={handleCapture} takePicture={handleTakePicture} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    flex: 1
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center'
  }
});
