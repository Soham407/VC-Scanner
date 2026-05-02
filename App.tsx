import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as NetInfo from '@react-native-community/netinfo';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  FAB,
  IconButton,
  List,
  Snackbar,
  Surface,
  Text
} from 'react-native-paper';
import type { Session } from '@supabase/supabase-js';

import { AuthScreen } from './src/components/AuthScreen';
import { BlurryImageError, extractText } from './lib/ocr';
import { getActiveBoothId } from './src/lib/boothContext';
import { CaptureButton } from './src/components/CaptureButton';
import { CornerPill } from './src/components/CornerPill';
import { MotionBottomNav } from './src/components/MotionBottomNav';
import { PageTransitionWrapper } from './src/components/PageTransitionWrapper';
import { PermissionDeniedScreen } from './src/components/PermissionDeniedScreen';
import { QueueSheet } from './src/components/QueueSheet';
import { RecentScanCard } from './src/components/RecentScanCard';
import { ScanHeroCard } from './src/components/ScanHeroCard';
import { StatusChip, type OcrStatus } from './src/components/StatusChip';
import { prepareImage } from './src/lib/imagePrep';
import { supabase } from './src/lib/supabase';
import { MaterialThemeProvider, useAppTheme, useMaterialThemeControls } from './src/theme/materialTheme';
import { motion } from './src/theme/motion';
import {
  garbageCollectOrphanedQueueImages,
  scannerQueueStore,
  syncScannerQueueStoreNamespace,
  type ScannerHistoryItem,
  useScannerQueueStore
} from './store/scanner';

type AppTab = 'dashboard' | 'history' | 'profile';
type HistoryFilter = 'all' | 'saved' | 'needs-review';

const routes: Array<{
  focusedIcon: string;
  key: AppTab;
  title: string;
  unfocusedIcon: string;
}> = [
  { focusedIcon: 'view-dashboard', key: 'dashboard', title: 'Dashboard', unfocusedIcon: 'view-dashboard-outline' },
  { focusedIcon: 'clock', key: 'history', title: 'History', unfocusedIcon: 'clock-outline' },
  { focusedIcon: 'account', key: 'profile', title: 'Profile', unfocusedIcon: 'account-outline' }
];

type MetricTone = 'default' | 'error' | 'secondary' | 'tertiary';

type MetricRailItem = {
  label: string;
  tone?: MetricTone;
  value: number;
};

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

function getOAuthCodeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('code');
  } catch {
    const codeMatch = url.match(/[?&]code=([^&]+)/);
    return codeMatch ? decodeURIComponent(codeMatch[1]) : null;
  }
}

function DashboardScreen({
  history,
  inFlightCount,
  failedCount,
  onOpenCamera,
  onOpenHistory,
  status
}: {
  failedCount: number;
  history: ScannerHistoryItem[];
  inFlightCount: number;
  onOpenCamera: () => void;
  onOpenHistory: () => void;
  status: OcrStatus;
}) {
  const theme = useAppTheme();
  const parsedCount = history.filter((item) => item.parseStatus === 'parsed').length;
  const recent = history.slice(0, 3);

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <ScanHeroCard
          onOpenCamera={onOpenCamera}
          onOpenHistory={onOpenHistory}
          failedCount={failedCount}
          inFlightCount={inFlightCount}
          savedCount={history.length}
          status={status}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(110).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
        <MetricRail
          items={[
            { label: 'Saved', tone: 'default', value: history.length },
            { label: 'Ready', tone: 'tertiary', value: parsedCount },
            { label: 'Saving', tone: 'secondary', value: inFlightCount }
          ]}
        />
        {failedCount > 0 ? (
          <Text
            style={{ color: theme.colors.error, marginTop: 8 }}
            variant="labelLarge"
          >
            {failedCount} scan{failedCount === 1 ? '' : 's'} need a retry.
          </Text>
        ) : (
          <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }} variant="labelLarge">
            Tap the camera button to keep building your contact history.
          </Text>
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Card mode="outlined" style={styles.sectionCard}>
          <Card.Title subtitle="Tap a row to jump into the full history." title="Latest saves" />
          <Card.Content>
            {recent.length === 0 ? (
              <Text variant="bodyMedium">
                No saved cards yet.
              </Text>
            ) : (
              <View style={styles.recentList}>
                {recent.map((item) => (
                  <RecentScanCard item={item} key={item.id} onPress={onOpenHistory} />
                ))}
              </View>
            )}
          </Card.Content>
        </Card>
      </Animated.View>
    </ScreenShell>
  );
}

function HistoryScreen({ history, onOpenCamera }: { history: ScannerHistoryItem[]; onOpenCamera: () => void }) {
  const theme = useAppTheme();
  const clearHistory = useScannerQueueStore((state) => state.clearHistory);
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>('all');
  const savedCount = history.filter((item) => item.parseStatus === 'parsed').length;
  const needsReviewCount = history.length - savedCount;
  const handleClearHistory = (): void => {
    Alert.alert(
      'Delete all cards?',
      'This will remove every scan from your history. Background uploads already in progress will stay in the queue.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Delete',
          onPress: clearHistory
        }
      ]
    );
  };
  const filteredHistory = history.filter((item) => {
    if (activeFilter === 'saved') {
      return item.parseStatus === 'parsed';
    }

    if (activeFilter === 'needs-review') {
      return item.parseStatus !== 'parsed';
    }

    return true;
  });

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Surface
          elevation={2}
          style={[styles.historyHero, { backgroundColor: theme.colors.surfaceContainerHigh }]}
        >
          <View style={styles.historyHeroCopy}>
            <Text variant="headlineMedium">History</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} variant="bodyMedium">
              Review saved cards, filter what still needs work, and scan another card when you are ready.
            </Text>
          </View>
          <Button icon="camera" mode="contained" onPress={onOpenCamera} testID="history-empty-scan-button">
            Scan card
          </Button>
        </Surface>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(110).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
        <MetricRail
          items={[
            { label: 'Cards', tone: 'default', value: history.length },
            { label: 'Ready', tone: 'tertiary', value: savedCount },
            { label: 'Review', tone: 'secondary', value: needsReviewCount }
          ]}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
        <Surface
          elevation={1}
          style={[styles.historyToolbar, { backgroundColor: theme.colors.surfaceContainer }]}
        >
          <View style={styles.historyFilterRow}>
            <HistoryFilterPill
              active={activeFilter === 'all'}
              count={history.length}
              label="All"
              onPress={() => setActiveFilter('all')}
            />
            <HistoryFilterPill
              active={activeFilter === 'saved'}
              count={savedCount}
              label="Ready"
              onPress={() => setActiveFilter('saved')}
            />
            <HistoryFilterPill
              active={activeFilter === 'needs-review'}
              count={needsReviewCount}
              label="Review"
              onPress={() => setActiveFilter('needs-review')}
            />
          </View>
          {history.length > 0 ? (
            <Button compact mode="text" onPress={handleClearHistory} textColor={theme.colors.error}>
              Delete all
            </Button>
          ) : null}
        </Surface>
      </Animated.View>

      {filteredHistory.length === 0 ? (
        <Card mode="outlined" style={styles.emptyCard}>
          <Card.Content style={styles.emptyContent}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primaryContainer }]}>
              <List.Icon color={theme.colors.onPrimaryContainer} icon="card-account-details-outline" />
            </View>
            <Text variant="titleMedium">{history.length === 0 ? 'No cards yet' : 'Nothing here'}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }} variant="bodyMedium">
              {history.length === 0
                ? 'Scan your first business card to build your contact history.'
                : 'Try another filter to see more cards.'}
            </Text>
            <Button icon="camera" mode="contained" onPress={onOpenCamera}>
              Scan card
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <View style={styles.historyList}>
          {filteredHistory.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(Math.min(index * 45, 240)).duration(motion.duration.medium1).easing(motion.easing.emphasized)}
              layout={LinearTransition.springify().damping(24).stiffness(300)}
            >
              <RecentScanCard item={item} />
            </Animated.View>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

function HistoryFilterPill({
  active,
  count,
  label,
  onPress
}: {
  active: boolean;
  count: number;
  label: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const pressProgress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressProgress.value ? 0.96 : 1, motion.spring.fastEffects)
      }
    ]
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={onPress}
        onPressIn={() => {
          pressProgress.value = 1;
        }}
        onPressOut={() => {
          pressProgress.value = 0;
        }}
      >
        <Surface
          elevation={active ? 1 : 0}
          style={[
            styles.historyFilterPill,
            {
              backgroundColor: active ? theme.colors.secondaryContainer : theme.colors.surfaceContainerHighest
            }
          ]}
        >
          <Text
            style={{
              color: active ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant
            }}
            variant="labelLarge"
          >
            {label}
          </Text>
          <Text
            style={{
              color: active ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant
            }}
            variant="labelSmall"
          >
            {count}
          </Text>
        </Surface>
      </Pressable>
    </Animated.View>
  );
}

function ProfileScreen({
  onSignOut,
  userEmail
}: {
  onSignOut: () => void;
  userEmail: string | null | undefined;
}) {
  const theme = useAppTheme();
  const { colorMode, toggleColorMode } = useMaterialThemeControls();
  const history = useScannerQueueStore((state) => state.history);
  const queue = useScannerQueueStore((state) => state.queue);
  const parsedCount = history.filter((item) => item.parseStatus === 'parsed').length;
  const inFlightCount = queue.filter((item) => item.status !== 'failed').length;
  const failedCount = queue.filter((item) => item.status === 'failed').length;

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Surface
          elevation={2}
          style={[styles.profileHero, { backgroundColor: theme.colors.surfaceContainerHigh }]}
        >
          <View style={[styles.profileAvatar, { backgroundColor: theme.colors.tertiaryContainer }]}>
            <List.Icon color={theme.colors.onTertiaryContainer} icon="account-circle" />
          </View>
          <View style={styles.profileHeroCopy}>
            <Text variant="headlineMedium">Profile</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
              Signed in as {userEmail ?? 'your account'}.
            </Text>
          </View>
          <View style={styles.profileStatusWrap}>
            <StatusChip status={failedCount > 0 ? 'failed' : inFlightCount > 0 ? 'saving' : parsedCount > 0 ? 'parsed' : 'idle'} />
          </View>
          </Surface>
        </Animated.View>

      <Animated.View entering={FadeInDown.delay(110).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
        <MetricRail
          items={[
            { label: 'Saved', tone: 'default', value: history.length },
            { label: 'Ready', tone: 'tertiary', value: parsedCount },
            { label: 'Saving', tone: 'secondary', value: inFlightCount }
          ]}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Surface
          elevation={1}
          style={[styles.palettePanel, { backgroundColor: theme.colors.surfaceContainer }]}
        >
          <View>
            <Text variant="titleMedium">Appearance</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} variant="bodyMedium">
              Switch between light and dark color modes.
            </Text>
          </View>
          <View style={styles.colorModeRow}>
            <View style={styles.colorModePill}>
              <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                Current mode
              </Text>
              <Text variant="titleMedium">{colorMode === 'dark' ? 'Dark' : 'Light'}</Text>
            </View>
            <Button
              icon={colorMode === 'dark' ? 'weather-sunny' : 'weather-night'}
              mode="contained-tonal"
              onPress={toggleColorMode}
              testID="color-mode-toggle"
            >
              Switch to {colorMode === 'dark' ? 'light' : 'dark'}
            </Button>
          </View>
        </Surface>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(210).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
        <Button icon="logout" mode="outlined" onPress={onSignOut}>
          Sign out
        </Button>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(260).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Surface
          elevation={1}
          style={[styles.profileAccountPanel, { backgroundColor: theme.colors.surfaceContainer }]}
        >
          <View>
            <Text variant="titleMedium">Account</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} variant="bodyMedium">
              Saved cards stay tied to this profile. Sign out only when you want to switch accounts.
            </Text>
          </View>
          <View style={styles.profileAccountInfo}>
            <View style={[styles.profileSettingIcon, { backgroundColor: theme.colors.primaryContainer }]}>
              <List.Icon color={theme.colors.onPrimaryContainer} icon="email-outline" />
            </View>
            <View style={styles.profileSettingCopy}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Signed in as
              </Text>
              <Text variant="titleMedium">{userEmail ?? 'your account'}</Text>
            </View>
          </View>
        </Surface>
      </Animated.View>
    </ScreenShell>
  );
}

function CameraScreen({
  handleCapture,
  handlePickFromGallery,
  handleTakePicture,
  inFlightCount,
  isCapturing,
  onClose,
  onOpenQueue,
  permission,
  previewUri
}: {
  handleCapture: (uri: string) => void;
  handlePickFromGallery: () => void;
  handleTakePicture: (camera: CameraView | null) => Promise<string | null>;
  inFlightCount: number;
  isCapturing: boolean;
  onClose: () => void;
  onOpenQueue: () => void;
  permission: { granted: boolean } | null;
  previewUri: string | null;
}) {
  const cameraRef = useRef<CameraView | null>(null);
  const theme = useAppTheme();
  const containerScale = useSharedValue(0.92);
  const containerOpacity = useSharedValue(0);

  useEffect(() => {
    containerScale.value = withTiming(1, { duration: motion.duration.medium2, easing: motion.easing.emphasized });
    containerOpacity.value = withTiming(1, { duration: motion.duration.medium1, easing: motion.easing.standard });
  }, [containerOpacity, containerScale]);

  const containerTransformStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }]
  }));

  const takePicture = useCallback(async () => {
    return handleTakePicture(cameraRef.current);
  }, [handleTakePicture]);

  if (!permission) {
    return <View style={[styles.cameraContainer, { backgroundColor: theme.colors.surface }]} />;
  }

  if (!permission.granted) {
    return <PermissionDeniedScreen />;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.medium1).easing(motion.easing.emphasized)}
      exiting={FadeOut.duration(motion.duration.short4).easing(motion.easing.standardExit)}
      style={[styles.cameraContainer, { backgroundColor: theme.colors.scrim }, containerTransformStyle]}
    >
      {previewUri ? (
        <Animated.Image
          entering={FadeIn.duration(motion.duration.short4).easing(motion.easing.standard)}
          source={{ uri: previewUri }}
          style={StyleSheet.absoluteFill}
          testID="capture-preview"
        />
      ) : (
        <>
          <CameraView facing="back" ref={cameraRef} style={StyleSheet.absoluteFill} testID="camera-viewfinder" />
          <View style={styles.viewfinderScrim} pointerEvents="none">
            <View style={[styles.viewfinderFrame, { borderColor: theme.colors.primary }]} />
          </View>
          <Animated.View
            entering={FadeInDown.delay(80).duration(motion.duration.medium1).easing(motion.easing.emphasized)}
            style={styles.cameraTopBar}
          >
            <IconButton
              accessibilityLabel="Close camera"
              containerColor={theme.colors.surfaceContainerHighest}
              icon="close"
              mode="contained"
              onPress={onClose}
              size={24}
              testID="close-camera-button"
            />
            <StatusChip status={isCapturing || previewUri ? 'scanning' : inFlightCount > 0 ? 'saving' : 'idle'} />
            {__DEV__ ? (
              <Button
                compact
                icon="image"
                mode="contained-tonal"
                onPress={handlePickFromGallery}
                testID="pick-from-gallery-button"
              >
                Gallery
              </Button>
            ) : null}
          </Animated.View>
          <CaptureButton disabled={isCapturing} onCapture={handleCapture} takePicture={takePicture} />
          <CornerPill count={inFlightCount} onPress={onOpenQueue} />
        </>
      )}
    </Animated.View>
  );
}

function ScreenShell({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.screenContent}>{children}</ScrollView>
    </SafeAreaView>
  );
}

function MetricRail({ items }: { items: MetricRailItem[] }) {
  const theme = useAppTheme();

  return (
    <Surface elevation={1} style={[styles.metricRail, { backgroundColor: theme.colors.surfaceContainer }]}>
      {items.map((item, index) => {
        const toneColor = item.tone === 'error'
          ? theme.colors.error
          : item.tone === 'secondary'
            ? theme.colors.secondary
            : item.tone === 'tertiary'
              ? theme.colors.tertiary
              : theme.colors.primary;

        return (
          <View
            key={item.label}
            style={[
              styles.metricRailItem,
              index < items.length - 1 ? styles.metricRailItemDivider : null
            ]}
          >
            <Text style={{ color: toneColor }} variant="headlineSmall">
              {item.value}
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelLarge">
              {item.label}
            </Text>
          </View>
        );
      })}
    </Surface>
  );
}

function ScannerApp({
  onSignOut,
  session
}: {
  onSignOut: () => void;
  session: Session;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [previousTabIndex, setPreviousTabIndex] = useState(0);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const captureLockRef = useRef(false);
  const queueSheetRef = useRef<BottomSheetModal>(null);
  const isDrainingRef = useRef(false);
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const isConnected = NetInfo.useNetInfo().isConnected;

  const queue = useScannerQueueStore((state) => state.queue);
  const history = useScannerQueueStore((state) => state.history);
  const systemNotice = useScannerQueueStore((state) => state.systemNotice);
  const enqueue = useScannerQueueStore((state) => state.enqueue);
  const clearSystemNotice = useScannerQueueStore((state) => state.clearSystemNotice);
  const retry = useScannerQueueStore((state) => state.retry);
  const drainOnce = useScannerQueueStore((state) => state.drainOnce);

  const inFlightCount = queue.filter((item) => item.status !== 'failed').length;
  const failedCount = queue.filter((item) => item.status === 'failed').length;
  const activeIndex = routes.findIndex((route) => route.key === activeTab);
  const pageDirection = activeIndex >= previousTabIndex ? 1 : -1;
  const dashboardStatus: OcrStatus = failedCount > 0
    ? 'failed'
    : inFlightCount > 0
      ? 'saving'
      : history.some((item) => item.parseStatus === 'parsed')
        ? 'parsed'
        : 'idle';

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

  const handleTakePicture = useCallback(async (camera: CameraView | null): Promise<string | null> => {
    if (captureLockRef.current) {
      return null;
    }

    captureLockRef.current = true;
    setIsCapturing(true);

    try {
      const capturedPhoto = await camera?.takePictureAsync({
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
        let boothId: string | null = null;

        try {
          boothId = await getActiveBoothId();
        } catch (error) {
          console.warn('Active booth lookup failed; routing capture without booth context', error);
        }

        enqueue({
          id: leadId,
          imagePath: cachePath,
          rawText,
          boothId
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

  const openHistory = useCallback(() => {
    setIsCameraOpen(false);
    setPreviousTabIndex(activeIndex >= 0 ? activeIndex : 0);
    setActiveTab('history');
  }, [activeIndex]);

  const openCamera = useCallback(() => {
    setIsCameraOpen(true);
  }, []);

  const handleTabChange = useCallback((nextTab: AppTab) => {
    if (nextTab === activeTab) {
      return;
    }

    setPreviousTabIndex(activeIndex >= 0 ? activeIndex : 0);
    setActiveTab(nextTab);
  }, [activeIndex, activeTab]);

  const renderScene = useCallback(
    ({ route }: { route: { key: string } }) => {
      switch (route.key) {
        case 'history':
          return <HistoryScreen history={history} onOpenCamera={openCamera} />;
        case 'profile':
          return <ProfileScreen onSignOut={onSignOut} userEmail={session.user.email} />;
        case 'dashboard':
        default:
          return (
            <DashboardScreen
              failedCount={failedCount}
              history={history}
              inFlightCount={inFlightCount}
              onOpenCamera={openCamera}
              onOpenHistory={openHistory}
              status={dashboardStatus}
            />
          );
      }
    },
    [dashboardStatus, failedCount, history, inFlightCount, onSignOut, openCamera, openHistory, session.user.email]
  );

  return (
    <View style={[styles.appContainer, { backgroundColor: theme.colors.background }]}>
      {isCameraOpen ? (
        <CameraScreen
          handleCapture={handleCapture}
          handlePickFromGallery={handlePickFromGallery}
          handleTakePicture={handleTakePicture}
          inFlightCount={inFlightCount}
          isCapturing={isCapturing}
          onClose={() => setIsCameraOpen(false)}
          onOpenQueue={() => queueSheetRef.current?.present()}
          permission={permission}
          previewUri={previewUri}
        />
      ) : (
        <>
          <PageTransitionWrapper
            direction={pageDirection}
            key={activeTab}
            variant={activeTab === 'history' ? 'container' : 'shared-axis'}
          >
            {renderScene({ route: { key: activeTab } })}
          </PageTransitionWrapper>
          <FAB
            accessibilityLabel="Open camera"
            icon="camera"
            mode="flat"
            onPress={openCamera}
            style={[
              styles.cameraFab,
              {
                backgroundColor: theme.colors.primaryContainer,
                bottom: insets.bottom + 78
              }
            ]}
            testID="camera-fab"
          />
          <MotionBottomNav
            activeKey={activeTab}
            bottomInset={insets.bottom}
            onChange={handleTabChange}
            routes={routes}
          />
        </>
      )}
      <QueueSheet items={queue} onRetry={retry} ref={queueSheetRef} />
      <Snackbar
        action={{
          label: 'Dismiss',
          onPress: clearSystemNotice
        }}
        duration={2800}
        onDismiss={clearSystemNotice}
        testID="system-snackbar"
        visible={Boolean(systemNotice)}
      >
        {systemNotice ? `${systemNotice.title}: ${systemNotice.message}` : ''}
      </Snackbar>
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isScannerStoreReady, setIsScannerStoreReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase.auth.getSession();

      if (cancelled) {
        return;
      }

      if (error) {
        console.warn('Supabase session bootstrap failed', error);
      }

      setSession(data.session ?? null);
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const handleOAuthRedirect = async (url: string): Promise<void> => {
      const code = getOAuthCodeFromUrl(url);
      if (!code) {
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!cancelled && error) {
        console.warn('Supabase OAuth callback failed', error);
      }
    };

    void Linking.getInitialURL().then((url) => {
      if (typeof url === 'string') {
        void handleOAuthRedirect(url);
      }
    });

    const subscription = Linking.addEventListener('url', (event) => {
      void handleOAuthRedirect(event.url);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsScannerStoreReady(false);
      await syncScannerQueueStoreNamespace(session?.user.id ?? null);

      if (!cancelled) {
        setIsScannerStoreReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  const handleSignOut = useCallback(() => {
    void supabase.auth.signOut().catch((error) => {
      console.warn('Supabase sign out failed', error);
    });
  }, []);

  if (session === undefined || (session && !isScannerStoreReady)) {
    return (
      <GestureHandlerRootView style={styles.appContainer}>
        <SafeAreaProvider>
          <MaterialThemeProvider>
            <BottomSheetModalProvider>
              <StatusBar style="auto" />
              <View style={styles.loadingScreen}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingText} variant="titleMedium">
                  Loading account
                </Text>
              </View>
            </BottomSheetModalProvider>
          </MaterialThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (!session) {
    return (
      <GestureHandlerRootView style={styles.appContainer}>
        <SafeAreaProvider>
          <MaterialThemeProvider>
            <BottomSheetModalProvider>
              <StatusBar style="auto" />
              <AuthScreen />
            </BottomSheetModalProvider>
          </MaterialThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.appContainer}>
      <SafeAreaProvider>
        <MaterialThemeProvider>
          <BottomSheetModalProvider>
            <StatusBar style="auto" />
            <ScannerApp onSignOut={handleSignOut} session={session} />
          </BottomSheetModalProvider>
        </MaterialThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1
  },
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  loadingText: {
    marginTop: 12
  },
  cameraContainer: {
    flex: 1
  },
  cameraFab: {
    alignSelf: 'center',
    position: 'absolute'
  },
  cameraTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 16,
    position: 'absolute',
    right: 16,
    top: 48,
    zIndex: 5
  },
  emptyCard: {
    marginTop: 20
  },
  emptyContent: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56
  },
  historyFilterPill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12
  },
  historyFilterRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  historyHero: {
    alignItems: 'center',
    borderRadius: 28,
    flexDirection: 'row',
    gap: 16,
    padding: 18
  },
  historyHeroCopy: {
    flex: 1
  },
  historyList: {
    gap: 10
  },
  historyToolbar: {
    alignItems: 'center',
    borderRadius: 24,
    flexDirection: 'row',
    gap: 12,
    padding: 12
  },
  palettePanel: {
    borderRadius: 24,
    gap: 18,
    padding: 18
  },
  metricRail: {
    borderRadius: 24,
    flexDirection: 'row'
  },
  metricRailItem: {
    flex: 1,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 16
  },
  metricRailItemDivider: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(127, 127, 127, 0.22)'
  },
  profileAvatar: {
    alignItems: 'center',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    width: 52
  },
  profileHero: {
    alignItems: 'center',
    borderRadius: 28,
    flexDirection: 'row',
    gap: 14,
    padding: 18
  },
  profileHeroCopy: {
    flex: 1
  },
  profileAccountInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  profileAccountPanel: {
    borderRadius: 24,
    gap: 16,
    padding: 18
  },
  profileStatusWrap: {
    alignItems: 'flex-end'
  },
  profileSettingCopy: {
    flex: 1
  },
  profileSettingIcon: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  recentList: {
    gap: 10
  },
  screen: {
    flex: 1
  },
  screenContent: {
    gap: 16,
    padding: 16,
    paddingBottom: 96
  },
  sectionCard: {
    marginTop: 4
  },
  colorModePill: {
    flex: 1,
    gap: 2
  },
  colorModeRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center'
  },
  viewfinderFrame: {
    aspectRatio: 1.58,
    borderRadius: 20,
    borderWidth: 2,
    maxWidth: 360,
    opacity: 0.92,
    width: '82%'
  },
  viewfinderScrim: {
    alignItems: 'center',
    bottom: 132,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 120
  }
});
