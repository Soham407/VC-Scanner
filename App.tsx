import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as NetInfo from '@react-native-community/netinfo';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BlurryImageError, extractText } from './lib/ocr';
import { garbageCollectOrphanedQueueImages, scannerQueueStore, useScannerQueueStore } from './store/scanner';
import { CaptureButton } from './src/components/CaptureButton';
import { CornerPill } from './src/components/CornerPill';
import { PermissionDeniedScreen } from './src/components/PermissionDeniedScreen';
import { QueueSheet } from './src/components/QueueSheet';
import { prepareImage } from './src/lib/imagePrep';

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
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const captureLockRef = useRef(false);
  const queueSheetRef = useRef<BottomSheetModal>(null);
  const isDrainingRef = useRef(false);
  const isConnected = NetInfo.useNetInfo().isConnected;

  const queue = useScannerQueueStore((state) => state.queue);
  const enqueue = useScannerQueueStore((state) => state.enqueue);
  const retry = useScannerQueueStore((state) => state.retry);
  const drainOnce = useScannerQueueStore((state) => state.drainOnce);

  const inFlightCount = queue.filter((item) => item.status !== 'failed').length;

  useEffect(() => {
    if (!permission) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    const runGc = async (): Promise<void> => {
      try {
        await garbageCollectOrphanedQueueImages(scannerQueueStore.getState().queue);
      } catch (error) {
        console.warn('Queue orphan GC failed', error);
      }
    };

    const persistApi = (scannerQueueStore as typeof scannerQueueStore & {
      persist?: {
        hasHydrated?: () => boolean;
        onFinishHydration?: (listener: () => void) => () => void;
      };
    }).persist;

    if (persistApi?.hasHydrated?.()) {
      void runGc();
      return;
    }

    const unsubscribe = persistApi?.onFinishHydration?.(() => {
      void runGc();
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (queue.length === 0 || isConnected === false || isDrainingRef.current) {
      return;
    }

    isDrainingRef.current = true;

    void (async () => {
      try {
        await drainOnce();
      } finally {
        isDrainingRef.current = false;
      }
    })();
  }, [queue, drainOnce, isConnected]);

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
        const leadId = createUuid();
        const { cachePath } = await prepareImage(uri, leadId);
        const rawText = await extractText(cachePath);

        enqueue({
          id: leadId,
          imagePath: cachePath,
          rawText
        });
      } catch (error) {
        if (error instanceof BlurryImageError) {
          Alert.alert('Image too blurry, retake');
          return;
        }

        console.error('Capture pipeline failed', error);
        Alert.alert('Scan failed', 'Please try again');
      } finally {
        setPreviewUri(null);
      }
    })();
  }, [enqueue]);

  const handlePillPress = useCallback(() => {
    queueSheetRef.current?.present();
  }, []);

  const handlePickFromGallery = useCallback(() => {
    void (async () => {
      const pickedImageResult = await launchImageLibraryAsync({
        quality: 1
      });

      if (pickedImageResult.canceled || pickedImageResult.assets.length === 0) {
        return;
      }

      handleCapture(pickedImageResult.assets[0].uri);
    })();
  }, [handleCapture]);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return <PermissionDeniedScreen />;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <BottomSheetModalProvider>
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
              {__DEV__ ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={handlePickFromGallery}
                  style={styles.galleryPickerButton}
                  testID="pick-from-gallery-button"
                >
                  <Text style={styles.galleryPickerButtonText}>Pick from gallery</Text>
                </Pressable>
              ) : null}
              <CaptureButton disabled={isCapturing} onCapture={handleCapture} takePicture={handleTakePicture} />
              <CornerPill count={inFlightCount} onPress={handlePillPress} />
            </>
          )}
          <QueueSheet items={queue} onRetry={retry} ref={queueSheetRef} />
        </View>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    flex: 1
  },
  galleryPickerButton: {
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    borderRadius: 8,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'absolute',
    top: 48,
    zIndex: 5
  },
  galleryPickerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  }
});
