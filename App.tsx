import * as NetInfo from '@react-native-community/netinfo';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { Component, type ComponentProps, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Image, Linking, type AppStateStatus, type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  IconButton,
  List,
  Snackbar,
  Surface,
  TextInput,
  Text
} from './src/design/openDesign';
import type { Session } from '@supabase/supabase-js';

import { AuthScreen } from './src/components/AuthScreen';
import { BlurryImageError, extractText } from './lib/ocr';
import { type TeamInboxItem } from './src/lib/teamInbox';
import { updateScannedLeadDetails } from './src/lib/teamReview';
import { type AccessibleTeam } from './src/lib/teams';
import { type TeamWorkspaceState, useTeamWorkspace } from './src/hooks/useTeamWorkspace';
import type { TeamMember } from './src/lib/teamMembers';
import { CaptureButton } from './src/components/CaptureButton';
import { CornerPill } from './src/components/CornerPill';
import { MotionBottomNav } from './src/components/MotionBottomNav';
import { PageTransitionWrapper } from './src/components/PageTransitionWrapper';
import { PermissionDeniedScreen } from './src/components/PermissionDeniedScreen';
import { QueueSheet } from './src/components/QueueSheet';
import { RecentScanCard } from './src/components/RecentScanCard';
import { ScanHeroCard } from './src/components/ScanHeroCard';
import { BottomSheetModal, BottomSheetModalProvider, type BottomSheetModalHandle } from './src/components/bottomSheet';
import { TeamAssignmentBatchSheet } from './src/components/TeamAssignmentBatchSheet';
import { TeamReassignSheet } from './src/components/TeamReassignSheet';
import { StatusChip, type OcrStatus } from './src/components/StatusChip';
import { prepareImage, type ImageCropRegion } from './src/lib/imagePrep';
import { consumeAuthRedirectFlow, type AuthRedirectIntent } from './src/lib/authRedirect';
import { parseCardPreview, saveParsedCard, type ParsedCard, type ParseStatus } from './src/lib/scanCard';
import { supabase } from './src/lib/supabase';
import { deleteCardImages, uploadCardImage } from './src/lib/upload';
import { AppPreferencesProvider, useAppPreferences } from './src/state/appPreferences';
import { MaterialThemeProvider, useAppTheme, useMaterialThemeControls } from './src/theme/materialTheme';
import { motion } from './src/theme/motion';
import {
  garbageCollectOrphanedQueueImages,
  scannerQueueStore,
  syncScannerQueueStoreNamespace,
  type ScannerHistoryItem,
  type ScannerQueueItem,
  useScannerQueueStore
} from './store/scanner';

type AppTab = 'dashboard' | 'history' | 'team' | 'queue' | 'profile';
type HistoryFilter = 'all' | 'saved' | 'needs-review' | 'unassigned' | 'assigned' | 'done';
type HistoryMode = 'leader-inbox' | 'worker-history';
type CardCaptureMode = 'singleSided' | 'doubleSided';
type CardSide = 'front' | 'back';
type CameraFacing = 'back' | 'front';
type CameraCaptureFrame = {
  height: number;
  viewportHeight: number;
  viewportWidth: number;
  width: number;
  x: number;
  y: number;
};

type PendingScanReview = {
  cachePath: string;
  cachePaths: string[];
  leadId: string;
  parsed: ParsedCard;
  parseStatus: ParseStatus;
  rawText: string;
  storagePath: string;
  storagePaths: string[];
  uploadLeadIds: string[];
  teamId: string | null;
};

type CapturedCardSide = {
  cachePath: string;
  rawText: string;
  side: CardSide;
  storagePath: string;
  uploadLeadId: string;
};

type ParsedCardField = keyof ParsedCard;
type ParsedReviewTarget = ParsedCardField | 'extraText';

type ParsedReviewBlock = {
  id: string;
  assignedField: ParsedReviewTarget;
  source: 'ocr' | 'parsed';
  text: string;
};

type RootErrorBoundaryState = {
  error: Error | null;
};

const REVIEW_SAVE_TIMEOUT_MS = 20000;
const CAPTURE_PROCESSING_TIMEOUT_MS = 12000;
const CAPTURE_CLOUD_STEP_TIMEOUT_MS = 20000;
const CAMERA_GUIDE_TOP_OFFSET = 96;
const CAMERA_GUIDE_BOTTOM_OFFSET = 154;
const CAMERA_CAPTURE_MARGIN = 32;

type CaptureProcessingState = {
  message: string;
  timedOut: boolean;
};

const parsedCardFields: Array<{
  key: ParsedCardField;
  label: string;
  keyboardType?: ComponentProps<typeof TextInput>['keyboardType'];
  multiline?: boolean;
}> = [
  { key: 'fullName', label: 'Name' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'companyName', label: 'Company' },
  { key: 'productServices', label: 'Product/Services', multiline: true },
  { key: 'email', label: 'Email', keyboardType: 'email-address' },
  { key: 'phoneNumber', label: 'Phone', keyboardType: 'phone-pad' },
  { key: 'address', label: 'Address', multiline: true }
];

function getReviewFieldIcon(field: ParsedCardField): ComponentProps<typeof MaterialCommunityIcons>['name'] {
  switch (field) {
    case 'fullName':
      return 'account';
    case 'jobTitle':
      return 'briefcase';
    case 'companyName':
      return 'office-building';
    case 'productServices':
      return 'shape-outline';
    case 'email':
      return 'email-outline';
    case 'phoneNumber':
      return 'phone';
    case 'address':
      return 'map-marker-outline';
    default:
      return 'text-box-outline';
  }
}

function getTeamInboxItemTitle(item: TeamInboxItem): string {
  return item.companyName ?? item.fullName ?? item.rawText.split('\n')[0] ?? 'Untitled scan';
}

function getTeamInboxItemSubtitle(item: TeamInboxItem): string {
  return item.fullName ?? item.jobTitle ?? item.email ?? item.id;
}

function getQueueItemTitle(item: ScannerQueueItem): string {
  const filename = item.imagePath.split('/').pop()?.split('?')[0] ?? item.id;
  return filename.length > 0 ? filename : item.id;
}

function getQueueItemSubtitle(item: ScannerQueueItem): string {
  if (item.status === 'failed' && item.error) {
    return item.error;
  }

  if (item.status === 'uploading') {
    return 'Uploading image';
  }

  if (item.status === 'parsing') {
    return 'Parsing details';
  }

  return 'Waiting to save';
}

const queueStatusLabels: Record<ScannerQueueItem['status'], string> = {
  failed: 'Needs retry',
  parsing: 'Finishing',
  uploading: 'Saving'
};

function getAssignmentLabel(item: TeamInboxItem): string {
  if (!item.assignmentState) {
    return 'In team inbox';
  }

  if (item.assignmentState === 'done') {
    return 'Completed';
  }

  if (item.assignmentState === 'needs_review') {
    return 'Needs review';
  }

  return 'Assigned';
}

function getMemberLabel(memberLabel: string | undefined | null): string {
  return memberLabel ?? 'Worker';
}

function scannerHistoryToInboxItem(item: ScannerHistoryItem, userId: string): TeamInboxItem {
  return {
    address: item.parsed.address,
    assignedAt: null,
    assignedToUserId: null,
    assignmentState: null,
    capturedByUserId: userId,
    companyName: item.parsed.companyName,
    createdAt: new Date(item.savedAt).toISOString(),
    email: item.parsed.email,
    fullName: item.parsed.fullName,
    id: item.id,
    imagePath: item.imagePath,
    jobTitle: item.parsed.jobTitle,
    parseStatus: item.parseStatus,
    phoneNumber: item.parsed.phoneNumber,
    productServices: item.parsed.productServices,
    rawText: item.rawText,
    teamId: null
  };
}

function normalizeReviewText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9@.+]/g, '');
}

function splitReviewLines(value: string | null): string[] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function removeReviewBlockFromValue(value: string, blockText: string): string {
  const target = normalizeReviewText(blockText);
  return splitReviewLines(value)
    .filter((line) => normalizeReviewText(line) !== target)
    .join('\n');
}

function appendReviewBlockToValue(value: string, blockText: string): string {
  const trimmedBlock = blockText.trim();
  if (!trimmedBlock) {
    return value;
  }

  const currentLines = splitReviewLines(value);
  const target = normalizeReviewText(trimmedBlock);
  if (currentLines.some((line) => normalizeReviewText(line) === target)) {
    return currentLines.join('\n');
  }

  return [...currentLines, trimmedBlock].join('\n');
}

function parsedCardToEditableValues(parsed: ParsedCard): Record<ParsedCardField, string> {
  return {
    address: parsed.address ?? '',
    companyName: parsed.companyName ?? '',
    email: parsed.email ?? '',
    fullName: parsed.fullName ?? '',
    jobTitle: parsed.jobTitle ?? '',
    phoneNumber: parsed.phoneNumber ?? '',
    productServices: parsed.productServices ?? ''
  };
}

function editableValuesToParsedCard(values: Record<ParsedCardField, string>): ParsedCard {
  const normalize = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    address: normalize(values.address),
    companyName: normalize(values.companyName),
    email: normalize(values.email),
    fullName: normalize(values.fullName),
    jobTitle: normalize(values.jobTitle),
    phoneNumber: normalize(values.phoneNumber),
    productServices: normalize(values.productServices)
  };
}

function getLocalParseStatus(parsed: ParsedCard): ParseStatus {
  return Object.values(parsed).some((value) => value !== null) ? 'parsed' : 'unparsed';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return 'Unknown error';
}

function isRetryableCaptureError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  if (typeof error === 'object' && error !== null) {
    const status = (error as { status?: unknown; statusCode?: unknown }).status
      ?? (error as { status?: unknown; statusCode?: unknown }).statusCode;

    if (typeof status === 'number' && Number.isFinite(status)) {
      if (status >= 500) {
        return true;
      }

      if (status >= 400) {
        return false;
      }
    }
  }

  const normalizedMessage = getErrorMessage(error).toLowerCase();
  return (
    normalizedMessage.includes('network request failed')
    || normalizedMessage.includes('failed to fetch')
    || normalizedMessage.includes('failed to send a request')
    || normalizedMessage.includes('timeout')
    || normalizedMessage.includes('timed out')
    || normalizedMessage.includes('connection')
    || normalizedMessage.includes('offline')
  );
}

class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('App render failed', error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <View style={[styles.appContainer, styles.errorScreen]}>
          <ScrollView contentContainerStyle={styles.errorScreenContent}>
            <Text variant="headlineSmall">App failed to render</Text>
            <Text style={styles.errorMessage} variant="bodyMedium">
              Something went wrong while loading the app. Please close and reopen it.
            </Text>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

function createParsedReviewBlocks(rawText: string, parsed: ParsedCard): ParsedReviewBlock[] {
  const blocks: ParsedReviewBlock[] = [];
  const representedValues: string[] = [];

  parsedCardFields.forEach((field) => {
    splitReviewLines(parsed[field.key]).forEach((line, lineIndex) => {
      representedValues.push(normalizeReviewText(line));
      blocks.push({
        assignedField: field.key,
        id: `parsed-${field.key}-${lineIndex}`,
        source: 'parsed',
        text: line
      });
    });
  });

  const seenExtraValues = new Set<string>();
  splitReviewLines(rawText).forEach((line, lineIndex) => {
    const normalized = normalizeReviewText(line);
    if (!normalized || representedValues.some((value) => value.includes(normalized) || normalized.includes(value))) {
      return;
    }

    if (seenExtraValues.has(normalized)) {
      return;
    }

    seenExtraValues.add(normalized);
    blocks.push({
      assignedField: 'extraText',
      id: `ocr-extra-${lineIndex}`,
      source: 'ocr',
      text: line
    });
  });

  return blocks;
}

function formatCardSideRawText(sides: CapturedCardSide[]): string {
  return sides
    .map((side) => `${side.side === 'front' ? 'Front side' : 'Back side'} OCR:\n${side.rawText}`)
    .join('\n\n');
}

async function archiveReviewedImage(cachePath: string, leadId: string): Promise<string> {
  if (!FileSystem.cacheDirectory) {
    return cachePath;
  }

  const historyDirectory = `${FileSystem.cacheDirectory}history/`;
  await FileSystem.makeDirectoryAsync(historyDirectory, { intermediates: true });

  const archivedPath = `${historyDirectory}lead-${leadId}.jpg`;
  await FileSystem.deleteAsync(archivedPath, { idempotent: true });
  await FileSystem.copyAsync({
    from: cachePath,
    to: archivedPath
  });

  return archivedPath;
}

async function updateExistingReviewedLead(leadId: string, parsed: ParsedCard): Promise<void> {
  try {
    await updateScannedLeadDetails(leadId, {
      address: parsed.address,
      companyName: parsed.companyName,
      email: parsed.email,
      fullName: parsed.fullName,
      jobTitle: parsed.jobTitle,
      phoneNumber: parsed.phoneNumber,
      productServices: parsed.productServices
    });
    return;
  } catch {
    const { data, error } = await supabase
      .from('scanned_leads')
      .update({
        address: parsed.address,
        company_name: parsed.companyName,
        email: parsed.email,
        full_name: parsed.fullName,
        job_title: parsed.jobTitle,
        parse_status: getLocalParseStatus(parsed),
        phone_number: parsed.phoneNumber,
        product_services: parsed.productServices
      })
      .eq('id', leadId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Reviewed lead does not exist in cloud storage');
    }
  }
}

async function cleanupLocalCardImages(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => FileSystem.deleteAsync(path, { idempotent: true })));
}

async function cleanupRemoteCardImages(paths: string[]): Promise<void> {
  try {
    await deleteCardImages(paths);
  } catch (error) {
    console.warn('Card image cleanup failed', error);
  }
}

async function createSignedCardImageUrl(path: string | null): Promise<string> {
  if (!path) {
    return '';
  }

  const storagePath = path.startsWith('card-images/') ? path.slice('card-images/'.length) : path;
  const { data, error } = await supabase.storage.from('card-images').createSignedUrl(storagePath, 60 * 15);
  if (error || !data?.signedUrl) {
    return '';
  }

  return data.signedUrl;
}

async function loadCloudPersonalHistory(userId: string): Promise<ScannerHistoryItem[]> {
  const { data, error } = await supabase
    .from('scanned_leads')
    .select(`
      id,
      address,
      company_name,
      created_at,
      email,
      full_name,
      image_url,
      job_title,
      parse_status,
      phone_number,
      product_services,
      raw_ocr_text
    `)
    .eq('user_id', userId)
    .is('team_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{
    address: string | null;
    company_name: string | null;
    created_at: string;
    email: string | null;
    full_name: string | null;
    id: string;
    image_url: string | null;
    job_title: string | null;
    parse_status: ParseStatus;
    phone_number: string | null;
    product_services: string | null;
    raw_ocr_text: string | null;
  }>;

  const signedUrls = await Promise.all(rows.map((row) => createSignedCardImageUrl(row.image_url)));

  return rows.map((row, index) => ({
    id: row.id,
    imagePath: signedUrls[index] || '',
    parsed: {
      address: row.address,
      companyName: row.company_name,
      email: row.email,
      fullName: row.full_name,
      jobTitle: row.job_title,
      phoneNumber: row.phone_number,
      productServices: row.product_services
    },
    parseStatus: row.parse_status,
    rawText: row.raw_ocr_text ?? '',
    savedAt: Date.parse(row.created_at),
    storagePath: row.image_url ?? ''
  }));
}

const routes: Array<{
  focusedIcon: string;
  key: AppTab;
  title: string;
  unfocusedIcon: string;
}> = [
  { focusedIcon: 'view-dashboard', key: 'dashboard', title: 'Dashboard', unfocusedIcon: 'view-dashboard-outline' },
  { focusedIcon: 'clock', key: 'history', title: 'History', unfocusedIcon: 'clock-outline' },
  { focusedIcon: 'account-group', key: 'team', title: 'Team', unfocusedIcon: 'account-group-outline' },
  { focusedIcon: 'tray-full', key: 'queue', title: 'Queue', unfocusedIcon: 'tray' },
  { focusedIcon: 'account-circle', key: 'profile', title: 'Profile', unfocusedIcon: 'account-circle-outline' }
];

type MetricTone = 'default' | 'error' | 'secondary' | 'tertiary';

type MetricRailItem = {
  label: string;
  tone?: MetricTone;
  value: number;
};

function PageHeader({
  actions,
  kicker,
  status,
  summary,
  title
}: {
  actions?: React.ReactNode;
  kicker: string;
  status?: OcrStatus;
  summary: string;
  title: string;
}) {
  const theme = useAppTheme();

  return (
    <Surface elevation={2} style={[styles.pageHeader, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.pageHeaderTopRow}>
        <View style={styles.pageHeaderCopy}>
          <Text style={[styles.screenKicker, { color: theme.colors.primary }]} variant="labelSmall">
            {kicker}
          </Text>
          <Text variant="headlineMedium">{title}</Text>
        </View>
        {status ? <StatusChip status={status} /> : null}
      </View>
      <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }} variant="bodyMedium">
        {summary}
      </Text>
      {actions ? <View style={styles.pageHeaderActions}>{actions}</View> : null}
    </Surface>
  );
}

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

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function createCropRegionForFrame(
  imageWidth: number | undefined,
  imageHeight: number | undefined,
  frame: CameraCaptureFrame | null
): ImageCropRegion | null {
  if (!imageWidth || !imageHeight || !frame || frame.viewportWidth <= 0 || frame.viewportHeight <= 0) {
    return null;
  }

  const scale = Math.max(frame.viewportWidth / imageWidth, frame.viewportHeight / imageHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  const hiddenX = Math.max(0, (renderedWidth - frame.viewportWidth) / 2);
  const hiddenY = Math.max(0, (renderedHeight - frame.viewportHeight) / 2);
  const originX = clampNumber((frame.x + hiddenX) / scale, 0, imageWidth - 1);
  const originY = clampNumber((frame.y + hiddenY) / scale, 0, imageHeight - 1);
  const maxWidth = imageWidth - originX;
  const maxHeight = imageHeight - originY;

  return {
    height: Math.max(1, Math.round(clampNumber(frame.height / scale, 1, maxHeight))),
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.max(1, Math.round(clampNumber(frame.width / scale, 1, maxWidth)))
  };
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

function getOAuthCallbackParams(url: string): URLSearchParams {
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);

    if (parsed.hash.startsWith('#')) {
      const hashParams = new URLSearchParams(parsed.hash.slice(1));
      hashParams.forEach((value, key) => {
        if (!params.has(key)) {
          params.set(key, value);
        }
      });
    }

    return params;
  } catch {
    const [, afterQuestionMark = ''] = url.split('?');
    const [, hashFromUrl = ''] = url.split('#');
    const [queryPart = '', hashFromQuery = ''] = afterQuestionMark.split('#');
    const hashPart = hashFromQuery || hashFromUrl;
    const params = new URLSearchParams(queryPart);

    if (hashPart) {
      const hashParams = new URLSearchParams(hashPart);
      hashParams.forEach((value, key) => {
        if (!params.has(key)) {
          params.set(key, value);
        }
      });
    }

    return params;
  }
}

function DashboardScreen({
  activeTeamName,
  hasTeamWorkspace,
  history,
  inFlightCount,
  failedCount,
  onOpenCamera,
  onOpenHistory,
  historyLabel,
  status
}: {
  activeTeamName: string | null;
  hasTeamWorkspace: boolean;
  failedCount: number;
  history: ScannerHistoryItem[];
  inFlightCount: number;
  historyLabel: string;
  onOpenCamera: () => void;
  onOpenHistory: () => void;
  status: OcrStatus;
}) {
  const recent = history.slice(0, 3);

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <ScanHeroCard
          activeTeamName={activeTeamName}
          hasTeamWorkspace={hasTeamWorkspace}
          historyLabel={historyLabel}
          onOpenCamera={onOpenCamera}
          onOpenHistory={onOpenHistory}
          failedCount={failedCount}
          inFlightCount={inFlightCount}
          savedCount={history.length}
          status={status}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Card mode="outlined" style={styles.sectionCard}>
          <Card.Title subtitle="Recently saved cards from this device." title="Recent cards" />
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

function QueueScreen({
  items,
  onOpenCamera,
  onRetry
}: {
  items: ScannerQueueItem[];
  onOpenCamera: () => void;
  onRetry: (id: string) => void;
}) {
  const theme = useAppTheme();
  const failedCount = items.filter((item) => item.status === 'failed').length;
  const activeCount = items.length - failedCount;

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <PageHeader
          actions={(
            <Button icon="camera" mode="contained" onPress={onOpenCamera} testID="queue-open-camera-button">
              Scan
            </Button>
          )}
          kicker="Saving queue"
          status={failedCount > 0 ? 'failed' : items.length > 0 ? 'saving' : 'idle'}
          summary={items.length === 0
            ? 'No scans are waiting to save.'
            : `${activeCount} active · ${failedCount} need retry`}
          title="Queue"
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Surface elevation={1} style={[styles.historyToolbar, { backgroundColor: theme.colors.surfaceContainer }]}>
          <View style={styles.queueStatsRow}>
            <View style={[styles.queueStatPill, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
              <Text style={{ color: theme.colors.onSurface }} variant="headlineSmall">
                {items.length}
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                Waiting
              </Text>
            </View>
            <View style={[styles.queueStatPill, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
              <Text style={{ color: theme.colors.onSurface }} variant="headlineSmall">
                {activeCount}
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                Active
              </Text>
            </View>
            <View style={[styles.queueStatPill, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
              <Text style={{ color: theme.colors.error }} variant="headlineSmall">
                {failedCount}
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                Retry
              </Text>
            </View>
          </View>
        </Surface>
      </Animated.View>

      {items.length === 0 ? (
        <Card mode="outlined" style={styles.emptyCard}>
          <Card.Content style={styles.emptyContent}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primaryContainer }]}>
              <List.Icon color={theme.colors.onPrimaryContainer} icon="tray-full" />
            </View>
            <Text variant="titleMedium">Queue is clear</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }} variant="bodyMedium">
              Captures will show here while they upload, parse, or wait for a retry.
            </Text>
            <Button icon="camera" mode="contained" onPress={onOpenCamera}>
              Scan card
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <View style={styles.historyList}>
          {items.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(Math.min(index * 45, 240)).duration(motion.duration.medium1).easing(motion.easing.emphasized)}
            >
              <Animated.View layout={LinearTransition.springify().damping(24).stiffness(300)}>
                <Surface elevation={1} style={[styles.queueRow, { backgroundColor: theme.colors.surfaceContainer }]}>
                  <Image source={{ uri: item.imagePath }} style={styles.queueThumb} />
                  <View style={styles.queueRowCopy}>
                    <Text numberOfLines={1} variant="titleMedium">
                      {getQueueItemTitle(item)}
                    </Text>
                    <Text numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
                      {getQueueItemSubtitle(item)}
                    </Text>
                    <View style={styles.historyMetaRow}>
                      <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
                        {queueStatusLabels[item.status]}
                      </Text>
                      {item.teamId ? (
                        <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
                          Team save
                        </Text>
                      ) : null}
                    </View>
                    {item.status === 'failed' ? (
                      <View style={styles.assignmentActions}>
                        <Button compact mode="contained" onPress={() => onRetry(item.id)} testID={`queue-retry-${item.id}`}>
                          Retry
                        </Button>
                      </View>
                    ) : null}
                  </View>
                  <StatusChip status={item.status === 'failed' ? 'failed' : 'saving'} />
                </Surface>
              </Animated.View>
            </Animated.View>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

function HistoryScreen({
  canApproveBatch,
  canCreateBatch,
  canEditBatch,
  members,
  teamName,
  isBatchActionLoading,
  isLoading,
  isPersonalHistory,
  items,
  mode,
  hasMore,
  onLoadMore,
  isLoadingMore,
  onApproveBatch,
  onEditBatch,
  onCreateBatch,
  onUpdateAssignmentState,
  onOpenReassignAssignment,
  onOpenItem,
  onOpenCamera
}: {
  canApproveBatch: boolean;
  canCreateBatch: boolean;
  canEditBatch: boolean;
  members: TeamMember[];
  teamName: string | null;
  isBatchActionLoading: boolean;
  isLoading: boolean;
  isPersonalHistory: boolean;
  items: TeamInboxItem[];
  mode: HistoryMode;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  onApproveBatch: () => void;
  onEditBatch: () => void;
  onCreateBatch: () => void;
  onUpdateAssignmentState: (scannedLeadId: string, assignmentState: 'done' | 'needs_review') => Promise<void>;
  onOpenReassignAssignment: (item: TeamInboxItem) => void;
  onOpenItem: (item: TeamInboxItem) => void;
  onOpenCamera: () => void;
}) {
  const theme = useAppTheme();
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>('all');
  const memberLabelById = new Map(members.map((member) => [member.userId, member.email]));
  const parsedCount = items.filter((item) => item.parseStatus === 'parsed').length;
  const unassignedCount = items.filter((item) => !item.assignmentState).length;
  const assignedCount = items.filter((item) => item.assignmentState === 'assigned').length;
  const doneCount = items.filter((item) => item.assignmentState === 'done').length;
  const reviewCount = items.filter((item) => item.assignmentState === 'needs_review').length;
  const filteredItems = items.filter((item) => {
    if (mode === 'leader-inbox') {
      if (activeFilter === 'unassigned') {
        return !item.assignmentState;
      }

      if (activeFilter === 'assigned') {
        return item.assignmentState === 'assigned';
      }

      if (activeFilter === 'done') {
        return item.assignmentState === 'done';
      }

      if (activeFilter === 'needs-review') {
        return item.assignmentState === 'needs_review';
      }

      return true;
    }

    if (activeFilter === 'saved') {
      return item.parseStatus === 'parsed';
    }

    if (activeFilter === 'needs-review') {
      return item.parseStatus !== 'parsed';
    }

    return true;
  });
  const title = mode === 'leader-inbox' ? 'Team Inbox' : isPersonalHistory ? 'History' : 'Assignments';
  const availableFilters = mode === 'leader-inbox'
    ? [
        { count: items.length, label: 'All', value: 'all' as const },
        { count: unassignedCount, label: 'Open', value: 'unassigned' as const },
        { count: assignedCount, label: 'Assigned', value: 'assigned' as const },
        { count: doneCount, label: 'Done', value: 'done' as const },
        { count: reviewCount, label: 'Review', value: 'needs-review' as const }
      ]
    : [
        { count: items.length, label: 'All', value: 'all' as const },
        { count: parsedCount, label: 'Ready', value: 'saved' as const },
        { count: items.length - parsedCount, label: 'Review', value: 'needs-review' as const }
      ];
  const headerSummary = mode === 'leader-inbox'
    ? `${items.length} cards · ${unassignedCount} open`
    : isPersonalHistory
      ? `${items.length} cards saved`
      : `${items.length} assigned · ${reviewCount} need review`;

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <PageHeader
          actions={(
            <Button icon="camera" mode="contained" onPress={onOpenCamera} testID="history-empty-scan-button">
              Scan
            </Button>
          )}
          kicker={mode === 'leader-inbox' ? (teamName ?? 'Team workspace') : isPersonalHistory ? 'Personal workspace' : (teamName ?? 'Team workspace')}
          status={mode === 'leader-inbox' ? 'parsed' : items.length > 0 ? 'parsed' : 'idle'}
          summary={teamName ? `${headerSummary} · ${teamName}` : headerSummary}
          title={title}
        />
      </Animated.View>
      {mode === 'leader-inbox' ? (
        <Animated.View entering={FadeInDown.delay(130).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
          <Surface
            elevation={1}
            style={[styles.historyToolbar, { backgroundColor: theme.colors.surfaceContainer }]}
          >
            <View style={styles.batchActions}>
              <Button
                disabled={!canCreateBatch || isBatchActionLoading}
                mode="outlined"
                onPress={onCreateBatch}
                testID="create-assignment-batch-button"
              >
                Select cards
              </Button>
              <Button
                disabled={!canEditBatch || isBatchActionLoading}
                mode="outlined"
                onPress={onEditBatch}
                testID="edit-assignment-batch-button"
              >
                Edit selection
              </Button>
              <Button
                disabled={!canApproveBatch || isBatchActionLoading}
                mode="contained"
                onPress={onApproveBatch}
                testID="approve-assignment-batch-button"
              >
                Assign cards
              </Button>
            </View>
          </Surface>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(150).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
        <Surface
          elevation={1}
          style={[styles.historyToolbar, { backgroundColor: theme.colors.surfaceContainer }]}
        >
          <View style={styles.historyFilterRow}>
            {availableFilters.map((filter) => (
              <HistoryFilterPill
                active={activeFilter === filter.value}
                count={filter.count}
                key={filter.value}
                label={filter.label}
                onPress={() => setActiveFilter(filter.value)}
              />
            ))}
          </View>
        </Surface>
      </Animated.View>

      {isLoading ? (
        <Card mode="outlined" style={styles.emptyCard}>
          <Card.Content style={styles.emptyContent}>
            <ActivityIndicator />
            <Text style={{ marginTop: 12 }} variant="bodyMedium">
              Loading {mode === 'leader-inbox' ? 'team inbox' : 'your cards'}...
            </Text>
          </Card.Content>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card mode="outlined" style={styles.emptyCard}>
          <Card.Content style={styles.emptyContent}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primaryContainer }]}>
              <List.Icon color={theme.colors.onPrimaryContainer} icon="card-account-details-outline" />
            </View>
              <Text variant="titleMedium">{items.length === 0 ? 'No cards yet' : 'Nothing here'}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }} variant="bodyMedium">
                {items.length === 0
                  ? mode === 'leader-inbox'
                    ? 'Team scans will appear here as your team captures cards.'
                    : isPersonalHistory
                      ? 'Your saved scans will appear here.'
                      : 'Cards will appear here after a Team Leader assigns them.'
                  : 'Try another filter to see more cards.'}
              </Text>
              <Button icon="camera" mode="contained" onPress={onOpenCamera}>
                Scan card
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <View style={styles.historyList}>
          {filteredItems.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(Math.min(index * 45, 240)).duration(motion.duration.medium1).easing(motion.easing.emphasized)}
            >
              <Animated.View layout={LinearTransition.springify().damping(24).stiffness(300)}>
                <Pressable accessibilityRole="button" onPress={() => onOpenItem(item)} testID={`open-history-item-${item.id}`}>
                  <Surface elevation={1} style={[styles.historyRow, { backgroundColor: theme.colors.surfaceContainer }]}>
                    <View style={[styles.historyAvatar, { backgroundColor: theme.colors.surfaceContainerHighest }]}>
                      <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelLarge">
                        {getTeamInboxItemTitle(item).slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.historyRowCopy}>
                      <Text numberOfLines={1} variant="titleMedium">
                        {getTeamInboxItemTitle(item)}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
                        {getTeamInboxItemSubtitle(item)}
                      </Text>
                      <View style={styles.historyMetaRow}>
                        <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
                          {isPersonalHistory ? 'Saved scan' : getAssignmentLabel(item)}
                        </Text>
                        {!isPersonalHistory ? (
                          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
                            {mode === 'worker-history'
                              ? 'Assigned to you'
                              : item.assignmentState && item.assignedToUserId
                              ? `Assigned to ${getMemberLabel(memberLabelById.get(item.assignedToUserId))}`
                              : 'Waiting for assignment'}
                          </Text>
                        ) : null}
                      </View>
                      {mode === 'leader-inbox' && item.assignmentState ? (
                        <View style={styles.assignmentActions}>
                          <Button compact mode="outlined" onPress={() => onOpenReassignAssignment(item)}>
                            Reassign
                          </Button>
                        </View>
                      ) : null}
                      {!isPersonalHistory && mode === 'worker-history' && item.assignmentState ? (
                        <View style={styles.assignmentActions}>
                          <Button
                            compact
                            mode={item.assignmentState === 'done' ? 'contained' : 'outlined'}
                            onPress={() => {
                              void onUpdateAssignmentState(item.id, 'done').catch((error: unknown) => {
                                console.warn('Assignment update failed', error);
                              });
                            }}
                          >
                            Done
                          </Button>
                          <Button
                            compact
                            mode={item.assignmentState === 'needs_review' ? 'contained' : 'outlined'}
                            onPress={() => {
                              void onUpdateAssignmentState(item.id, 'needs_review').catch((error: unknown) => {
                                console.warn('Assignment update failed', error);
                              });
                            }}
                          >
                            Review
                          </Button>
                        </View>
                      ) : null}
                    </View>
                    <StatusChip status={item.parseStatus === 'parsed' ? 'parsed' : 'idle'} />
                  </Surface>
                </Pressable>
              </Animated.View>
            </Animated.View>
          ))}
          {hasMore ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Button
                disabled={isLoadingMore}
                loading={isLoadingMore}
                mode="outlined"
                onPress={onLoadMore}
                testID="load-more-history-button"
              >
                Load more
              </Button>
            </View>
          ) : null}
        </View>
      )}
    </ScreenShell>
  );
}

function AssignmentDetailScreen({
  item,
  isPersonalHistory,
  memberLabel,
  mode,
  onBack,
  onOpenReassignAssignment,
  onUpdateLeadDetails,
  onUpdateAssignmentState
}: {
  item: TeamInboxItem;
  isPersonalHistory: boolean;
  memberLabel: string | null;
  mode: HistoryMode;
  onBack: () => void;
  onOpenReassignAssignment: (item: TeamInboxItem) => void;
  onUpdateLeadDetails: TeamWorkspaceState['updateLeadDetails'];
  onUpdateAssignmentState: (scannedLeadId: string, assignmentState: 'done' | 'needs_review') => Promise<void>;
}) {
  const theme = useAppTheme();
  const [confirmNeedsReview, setConfirmNeedsReview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    address: item.address ?? '',
    companyName: item.companyName ?? '',
    email: item.email ?? '',
    fullName: item.fullName ?? '',
    jobTitle: item.jobTitle ?? '',
    phoneNumber: item.phoneNumber ?? '',
    productServices: item.productServices ?? ''
  });

  const updateEditValue = useCallback((field: keyof typeof editValues, value: string) => {
    setEditValues((current) => ({
      ...current,
      [field]: value
    }));
    setEditError(null);
  }, []);

  const saveLeadDetails = useCallback(() => {
    setIsSavingDetails(true);
    setEditError(null);

    void onUpdateLeadDetails(item.id, {
      address: editValues.address,
      companyName: editValues.companyName,
      email: editValues.email,
      fullName: editValues.fullName,
      jobTitle: editValues.jobTitle,
      phoneNumber: editValues.phoneNumber,
      productServices: editValues.productServices
    })
      .then(() => {
        setIsEditing(false);
        onBack();
      })
      .catch((error: unknown) => {
        console.warn('Lead details update failed', error);
        setEditError('Could not save changes. Please try again.');
      })
      .finally(() => setIsSavingDetails(false));
  }, [editValues, item.id, onBack, onUpdateLeadDetails]);

  if (confirmNeedsReview) {
    return (
      <ScreenShell>
        <PageHeader
          actions={(
            <Button compact icon="arrow-left" mode="text" onPress={() => setConfirmNeedsReview(false)}>
              Back
            </Button>
          )}
          kicker="Assignment"
          summary="Send this card back for a leader check."
          title="Mark as needs review?"
        />
        <Surface elevation={1} style={[styles.detailPanel, { backgroundColor: theme.colors.surfaceContainer }]}>
          <DetailField label="Assignment" value={getTeamInboxItemTitle(item)} />
          <DetailField label="Assigned to" value={getMemberLabel(memberLabel)} />
          <DetailField label="Team" value="Company team" />
        </Surface>
        <View style={styles.detailActions}>
          <Button
            mode="contained"
            onPress={() => {
              void onUpdateAssignmentState(item.id, 'needs_review').then(onBack).catch((error: unknown) => {
                console.warn('Assignment update failed', error);
              });
            }}
            testID="confirm-needs-review-button"
          >
            Mark needs review
          </Button>
          <Button mode="outlined" onPress={() => setConfirmNeedsReview(false)}>
            Cancel
          </Button>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <PageHeader
        actions={(
          <Button compact icon="arrow-left" mode="text" onPress={onBack}>
            Back
          </Button>
        )}
        kicker={isPersonalHistory ? 'Saved card' : item.assignmentState ? 'Assigned card' : 'Team inbox'}
        status={item.parseStatus === 'parsed' ? 'parsed' : 'idle'}
        summary={getTeamInboxItemSubtitle(item)}
        title={getTeamInboxItemTitle(item)}
      />

      <Surface elevation={1} style={[styles.detailPanel, { backgroundColor: theme.colors.surfaceContainer }]}>
        {isEditing ? (
          <>
            <EditableDetailField
              label="Name"
              onChangeText={(value) => updateEditValue('fullName', value)}
              testID="edit-lead-full-name-input"
              value={editValues.fullName}
            />
            <EditableDetailField
              label="Role"
              onChangeText={(value) => updateEditValue('jobTitle', value)}
              testID="edit-lead-job-title-input"
              value={editValues.jobTitle}
            />
            <EditableDetailField
              label="Company"
              onChangeText={(value) => updateEditValue('companyName', value)}
              testID="edit-lead-company-name-input"
              value={editValues.companyName}
            />
            <EditableDetailField
              label="Product/Services"
              multiline
              onChangeText={(value) => updateEditValue('productServices', value)}
              testID="edit-lead-product-services-input"
              value={editValues.productServices}
            />
            <EditableDetailField
              autoCapitalize="none"
              keyboardType="email-address"
              label="Email"
              onChangeText={(value) => updateEditValue('email', value)}
              testID="edit-lead-email-input"
              value={editValues.email}
            />
            <EditableDetailField
              keyboardType="phone-pad"
              label="Phone"
              onChangeText={(value) => updateEditValue('phoneNumber', value)}
              testID="edit-lead-phone-input"
              value={editValues.phoneNumber}
            />
            <EditableDetailField
              label="Address"
              multiline
              onChangeText={(value) => updateEditValue('address', value)}
              testID="edit-lead-address-input"
              value={editValues.address}
            />
            {editError ? (
              <Text style={{ color: theme.colors.error }} variant="bodySmall">
                {editError}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <DetailField label="Name" value={item.fullName ?? 'Not found'} />
            <DetailField label="Role" value={item.jobTitle ?? 'Not found'} />
            <DetailField label="Company" value={item.companyName ?? 'Not found'} />
            <DetailField label="Product/Services" value={item.productServices ?? 'Not found'} />
            <DetailField label="Email" value={item.email ?? 'Not found'} />
            <DetailField label="Phone" value={item.phoneNumber ?? 'Not found'} />
            <DetailField label="Address" value={item.address ?? 'Not found'} />
          </>
        )}
      </Surface>

      {!isPersonalHistory ? (
        <Surface elevation={1} style={[styles.detailPanel, { backgroundColor: theme.colors.surfaceContainer }]}>
          <DetailField label="Status" value={getAssignmentLabel(item)} />
          <DetailField label="Captured by" value="Team user" />
          <DetailField label="Visible to" value={item.assignmentState ? getMemberLabel(memberLabel) : 'Team Leaders'} />
        </Surface>
      ) : null}

      <View style={styles.detailActions}>
        {isEditing ? (
          <>
            <Button
              loading={isSavingDetails}
              disabled={isSavingDetails}
              mode="contained"
              onPress={saveLeadDetails}
              testID="save-lead-details-button"
            >
              Save changes
            </Button>
            <Button
              disabled={isSavingDetails}
              mode="outlined"
              onPress={() => {
                setEditValues({
                  address: item.address ?? '',
                  companyName: item.companyName ?? '',
                  email: item.email ?? '',
                  fullName: item.fullName ?? '',
                  jobTitle: item.jobTitle ?? '',
                  phoneNumber: item.phoneNumber ?? '',
                  productServices: item.productServices ?? ''
                });
                setEditError(null);
                setIsEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button icon="pencil" mode="contained-tonal" onPress={() => setIsEditing(true)} testID="edit-lead-details-button">
            Edit
          </Button>
        )}
        {!isEditing && mode === 'worker-history' && item.assignmentState ? (
          <>
            <Button
              mode={item.assignmentState === 'done' ? 'contained' : 'outlined'}
              onPress={() => {
                void onUpdateAssignmentState(item.id, 'done').then(onBack).catch((error: unknown) => {
                  console.warn('Assignment update failed', error);
                });
              }}
            >
              Mark done
            </Button>
            <Button mode="outlined" onPress={() => setConfirmNeedsReview(true)}>
              Needs review
            </Button>
          </>
        ) : null}
        {!isEditing && mode === 'leader-inbox' && item.assignmentState ? (
          <Button mode="contained" onPress={() => onOpenReassignAssignment(item)}>
            Reassign card
          </Button>
        ) : null}
      </View>
    </ScreenShell>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <View style={styles.detailField}>
      <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
        {label}
      </Text>
      <Text variant="titleSmall">{value}</Text>
    </View>
  );
}

function EditableDetailField({
  label,
  onChangeText,
  testID,
  value,
  ...inputProps
}: {
  label: string;
  onChangeText: (value: string) => void;
  testID: string;
  value: string;
} & Omit<ComponentProps<typeof TextInput>, 'label' | 'mode' | 'onChangeText' | 'testID' | 'value'>) {
  return (
    <TextInput
      {...inputProps}
      label={label}
      mode="outlined"
      onChangeText={onChangeText}
      testID={testID}
      value={value}
    />
  );
}

function CardCaptureModeScreen({
  activeTeamName,
  onCancel,
  onSelect
}: {
  activeTeamName: string | null;
  onCancel: () => void;
  onSelect: (mode: CardCaptureMode) => void;
}) {
  const theme = useAppTheme();

  return (
    <ScreenShell>
      <PageHeader
        actions={(
          <Button mode="outlined" onPress={onCancel}>
            Cancel
          </Button>
        )}
        kicker={activeTeamName ?? 'Personal workspace'}
        summary="Use double-sided only when important details are printed on the back."
        title="Choose capture type"
      />

      <Surface elevation={1} style={[styles.captureModePanel, { backgroundColor: theme.colors.surfaceContainer }]}>
        <Pressable
          onPress={() => onSelect('singleSided')}
          style={({ pressed }) => [
            styles.captureModeOption,
            {
              backgroundColor: theme.colors.surfaceContainerHighest,
              borderColor: theme.colors.outlineVariant,
              opacity: pressed ? 0.78 : 1
            }
          ]}
          testID="single-sided-capture-button"
        >
          <View style={[styles.captureModeIcon, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons color={theme.colors.onPrimaryContainer} name="card-account-details-outline" size={24} />
          </View>
          <View style={styles.captureModeCopy}>
            <Text variant="titleMedium">Single-sided card</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
              Capture one photo and review the parsed fields.
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => onSelect('doubleSided')}
          style={({ pressed }) => [
            styles.captureModeOption,
            {
              backgroundColor: theme.colors.surfaceContainerHighest,
              borderColor: theme.colors.primary,
              opacity: pressed ? 0.78 : 1
            }
          ]}
          testID="double-sided-capture-button"
        >
          <View style={[styles.captureModeIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
            <MaterialCommunityIcons color={theme.colors.onSecondaryContainer} name="cards-outline" size={24} />
          </View>
          <View style={styles.captureModeCopy}>
            <Text variant="titleMedium">Double-sided card</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
              Capture the front and back. Both sides are parsed together for better accuracy.
            </Text>
          </View>
        </Pressable>
      </Surface>

    </ScreenShell>
  );
}

function BatchApprovalConfirmScreen({
  allocations,
  scanCount,
  workerCount,
  workers,
  onApprove,
  onBack
}: {
  allocations: Array<{ count: number; userId: string }>;
  scanCount: number;
  workerCount: number;
  workers: Array<{ email: string; userId: string }>;
  onApprove: () => void;
  onBack: () => void;
}) {
  const theme = useAppTheme();
  const assignedCount = allocations.reduce((total, allocation) => total + allocation.count, 0);

  return (
    <ScreenShell>
      <PageHeader
        actions={(
          <Button compact icon="arrow-left" mode="text" onPress={onBack}>
            Back
          </Button>
        )}
        kicker="Final approval"
        summary={`${scanCount} cards · ${workerCount} workers · ${assignedCount}/${scanCount} allocated`}
        title={`Assign ${scanCount} card${scanCount === 1 ? '' : 's'}?`}
      />
      <Surface elevation={1} style={[styles.allocationPreviewPanel, { backgroundColor: theme.colors.surfaceContainer }]}>
        <View style={styles.teamSectionHeader}>
          <Text variant="titleMedium">Worker split</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
            {assignedCount}/{scanCount}
          </Text>
        </View>
        <View style={styles.memberList}>
          {workers.map((worker) => {
            const allocation = allocations.find((entry) => entry.userId === worker.userId);

            return (
              <Surface
                key={worker.userId}
                elevation={0}
                style={[styles.memberRow, { backgroundColor: theme.colors.surfaceContainerHighest }]}
              >
                <View style={styles.memberRowCopy}>
                  <Text variant="titleSmall">{worker.email}</Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                    {allocation?.count ?? 0} cards
                  </Text>
                </View>
              </Surface>
            );
          })}
        </View>
      </Surface>
      <View style={styles.detailActions}>
        <Button disabled={assignedCount !== scanCount} mode="contained" onPress={onApprove} testID="confirm-approve-assignment-batch-button">
          Assign cards
        </Button>
        <Button mode="outlined" onPress={onBack}>
          Keep editing
        </Button>
      </View>
    </ScreenShell>
  );
}

function ParsedCardReviewScreen({
  activeTeamName,
  isSaving,
  review,
  onAddBackSide,
  onRetake,
  onSave
}: {
  activeTeamName: string | null;
  isSaving: boolean;
  review: PendingScanReview;
  onAddBackSide: (() => void) | null;
  onRetake: () => void;
  onSave: (parsed: ParsedCard) => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [fieldValues, setFieldValues] = useState<Record<ParsedCardField, string>>(() => parsedCardToEditableValues(review.parsed));
  const [blocks, setBlocks] = useState<ParsedReviewBlock[]>(() => createParsedReviewBlocks(review.rawText, review.parsed));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isExtraTextVisible, setIsExtraTextVisible] = useState(false);

  const moveBlock = useCallback((blockId: string, targetField: ParsedReviewTarget) => {
    setBlocks((currentBlocks) => {
      const block = currentBlocks.find((candidate) => candidate.id === blockId);
      if (!block) {
        return currentBlocks;
      }

      setFieldValues((currentValues) => {
        const nextValues = { ...currentValues };
        if (block.assignedField !== 'extraText') {
          nextValues[block.assignedField] = removeReviewBlockFromValue(nextValues[block.assignedField], block.text);
        }

        if (targetField !== 'extraText') {
          nextValues[targetField] = appendReviewBlockToValue(nextValues[targetField], block.text);
        }

        return nextValues;
      });

      return currentBlocks.map((candidate) =>
        candidate.id === blockId
          ? {
            ...candidate,
            assignedField: targetField
          }
          : candidate
      );
    });
    setSelectedBlockId(null);
  }, []);

  const updateFieldValue = useCallback((field: ParsedCardField, value: string) => {
    setFieldValues((currentValues) => ({
      ...currentValues,
      [field]: value
    }));
  }, []);

  const selectedBlock = selectedBlockId ? blocks.find((block) => block.id === selectedBlockId) ?? null : null;
  const assignedBlockCount = blocks.filter((block) => block.assignedField !== 'extraText').length;
  const extraBlockCount = blocks.length - assignedBlockCount;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.reviewScreen, { backgroundColor: theme.colors.background }]}>
      <View style={styles.reviewTopBar}>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onRetake} style={styles.reviewBackButton}>
          <MaterialCommunityIcons color={theme.colors.secondary} name="arrow-left" size={34} />
        </Pressable>
        <View style={styles.reviewHeaderCopy}>
          <Text style={{ color: theme.colors.secondary }} variant="headlineSmall">Profile Creator</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
            Review parsed fields
          </Text>
        </View>
        <View style={styles.reviewHeaderMeta}>
          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
            {isSaving ? 'Saving' : review.cachePaths.length > 1 ? '2 sides' : '1 side'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.reviewContent,
          { paddingBottom: Math.max(insets.bottom + 120, 140) }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.reviewHeroRow}>
          <Surface elevation={2} style={[styles.reviewPreviewCard, { backgroundColor: theme.colors.surface }]}>
            <Animated.Image resizeMode="cover" source={{ uri: review.cachePath }} style={styles.reviewPreviewImage} />
          </Surface>
          <View style={styles.reviewPreviewActions}>
            <Pressable
              onPress={onRetake}
              style={({ pressed }) => [
                styles.reviewPreviewAction,
                { backgroundColor: theme.colors.surface, opacity: pressed ? 0.82 : 1 }
              ]}
            >
              <MaterialCommunityIcons color="#D6A800" name="camera-retake-outline" size={28} />
              <Text style={{ color: theme.colors.secondary }} variant="titleMedium">Rescan</Text>
            </Pressable>
            {onAddBackSide ? (
              <Pressable
                onPress={onAddBackSide}
                style={({ pressed }) => [
                  styles.reviewPreviewAction,
                  { backgroundColor: theme.colors.surface, opacity: pressed ? 0.82 : 1 }
                ]}
              >
                <MaterialCommunityIcons color="#D6A800" name="plus" size={32} />
                <Text style={{ color: theme.colors.secondary, textAlign: 'center' }} variant="titleMedium">
                  Add Back Side
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setIsExtraTextVisible((current) => !current)}
                style={({ pressed }) => [
                  styles.reviewPreviewAction,
                  { backgroundColor: theme.colors.surface, opacity: pressed ? 0.82 : 1 }
                ]}
              >
                <MaterialCommunityIcons color="#D6A800" name="plus" size={34} />
                <Text style={{ color: theme.colors.secondary, textAlign: 'center' }} variant="titleMedium">
                  Add More
                </Text>
              </Pressable>
            )}
          </View>
        </View>

          {selectedBlock ? (
          <Surface
            elevation={1}
            style={[
              styles.selectedReviewBlockBanner,
              {
                backgroundColor: theme.colors.primaryContainer,
                borderColor: theme.colors.primary
              }
            ]}
          >
            <MaterialCommunityIcons color={theme.colors.onPrimaryContainer} name="cursor-move" size={20} />
            <View style={styles.selectedReviewBlockCopy}>
              <Text style={{ color: theme.colors.onPrimaryContainer }} variant="labelLarge">
                Selected OCR text
              </Text>
              <Text numberOfLines={2} style={{ color: theme.colors.onPrimaryContainer }} variant="bodySmall">
                {selectedBlock.text}
              </Text>
            </View>
            <Button compact mode="text" onPress={() => setSelectedBlockId(null)}>
              Cancel
            </Button>
          </Surface>
        ) : null}

        <View style={styles.reviewFieldList}>
          {parsedCardFields.map((field) => (
            <ParsedReviewField
              blocks={blocks.filter((block) => block.assignedField === field.key)}
              field={field}
              key={field.key}
              moveBlock={moveBlock}
              onChangeText={(value) => updateFieldValue(field.key, value)}
              selectedBlockId={selectedBlockId}
              setSelectedBlockId={setSelectedBlockId}
              value={fieldValues[field.key]}
            />
          ))}
        </View>

        {isExtraTextVisible ? (
          <Surface elevation={1} style={[styles.parsedReviewPanel, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.parsedReviewFieldHeader}>
              <View style={styles.parsedReviewFieldTitleRow}>
                <MaterialCommunityIcons color={theme.colors.onSurfaceVariant} name="tray-arrow-down" size={18} />
                <Text variant="titleSmall">Extra OCR text</Text>
                <View style={[styles.reviewBlockCountBadge, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
                  <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
                    {extraBlockCount}
                  </Text>
                </View>
              </View>
              {selectedBlock && selectedBlock.assignedField !== 'extraText' ? (
                <Button compact mode="text" onPress={() => moveBlock(selectedBlock.id, 'extraText')}>
                  Drop here
                </Button>
              ) : null}
            </View>
            <View style={styles.reviewBlockList}>
              {blocks.filter((block) => block.assignedField === 'extraText').map((block) => (
                <ParsedReviewBlockChip
                  block={block}
                  key={block.id}
                  moveBlock={moveBlock}
                  selected={selectedBlockId === block.id}
                  setSelectedBlockId={setSelectedBlockId}
                />
              ))}
            </View>
            {blocks.every((block) => block.assignedField !== 'extraText') ? (
              <View style={[styles.emptyReviewDropZone, { borderColor: theme.colors.outlineVariant }]}>
                <MaterialCommunityIcons color={theme.colors.onSurfaceVariant} name="check-circle-outline" size={18} />
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                  No unassigned OCR text.
                </Text>
              </View>
            ) : null}
          </Surface>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.reviewFooter,
          {
            backgroundColor: theme.colors.background,
            paddingBottom: Math.max(insets.bottom, 12)
          }
        ]}
      >
        <Button
          mode="outlined"
          onPress={() => setIsExtraTextVisible((current) => !current)}
          style={[styles.reviewFooterSecondaryButton, { backgroundColor: theme.colors.surfaceContainerHigh }]}
          testID="toggle-extra-fields-button"
        >
          ADD MORE FIELDS
        </Button>
        <Button
          disabled={isSaving}
          loading={isSaving}
          mode="contained"
          onPress={() => onSave(editableValuesToParsedCard(fieldValues))}
          style={styles.reviewFooterPrimaryButton}
          testID="save-parsed-review-button"
        >
          SAVE
        </Button>
      </View>
    </SafeAreaView>
  );
}

function ParsedReviewField({
  blocks,
  field,
  moveBlock,
  onChangeText,
  selectedBlockId,
  setSelectedBlockId,
  value
}: {
  blocks: ParsedReviewBlock[];
  field: (typeof parsedCardFields)[number];
  moveBlock: (blockId: string, targetField: ParsedReviewTarget) => void;
  onChangeText: (value: string) => void;
  selectedBlockId: string | null;
  setSelectedBlockId: (blockId: string | null) => void;
  value: string;
}) {
  const selectedBlock = selectedBlockId ? blocks.find((block) => block.id === selectedBlockId) : null;
  const theme = useAppTheme();
  const hasValue = value.trim().length > 0;
  return (
    <Surface elevation={1} style={[styles.profileFieldCard, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.parsedReviewFieldHeader}>
        <View style={styles.profileFieldContent}>
          <View style={[styles.profileFieldIconWrap, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
            <MaterialCommunityIcons color={theme.colors.secondary} name={getReviewFieldIcon(field.key)} size={24} />
          </View>
          <View style={styles.profileFieldCopy}>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
              {field.label}
            </Text>
            <TextInput
              autoCapitalize={field.key === 'email' ? 'none' : undefined}
              keyboardType={field.keyboardType}
              mode="flat"
              multiline={field.multiline}
              onChangeText={onChangeText}
              outlineStyle={styles.profileFieldInputWrap}
              placeholder={field.label}
              style={styles.profileFieldInput}
              testID={`parsed-review-${field.key}-input`}
              value={value}
            />
          </View>
        </View>
        <View style={styles.profileFieldActions}>
          {selectedBlockId && !selectedBlock ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => moveBlock(selectedBlockId, field.key)}
              style={styles.profileFieldActionButton}
              testID={`drop-${field.key}-button`}
            >
              <MaterialCommunityIcons color="#D6A800" name="tray-arrow-down" size={22} />
            </Pressable>
          ) : (
            <View style={[styles.reviewBlockCountBadge, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
              <MaterialCommunityIcons color="#D6A800" name="layers-outline" size={16} />
              <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
                {blocks.length}
              </Text>
            </View>
          )}
          {hasValue ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onChangeText('')} style={styles.profileFieldActionButton}>
              <MaterialCommunityIcons color={theme.colors.secondary} name="close" size={24} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {blocks.length > 0 ? (
        <View style={styles.reviewBlockList}>
          {blocks.map((block) => (
            <ParsedReviewBlockChip
              block={block}
              key={block.id}
              moveBlock={moveBlock}
              selected={selectedBlockId === block.id}
              setSelectedBlockId={setSelectedBlockId}
            />
          ))}
        </View>
      ) : selectedBlockId ? (
          <View style={[styles.emptyReviewDropZone, { borderColor: theme.colors.outlineVariant }]}>
            <MaterialCommunityIcons color={theme.colors.onSurfaceVariant} name="gesture-tap" size={18} />
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
              Tap the selected OCR text to assign it here.
            </Text>
          </View>
      ) : null}
    </Surface>
  );
}

function ParsedReviewBlockChip({
  block,
  moveBlock,
  selected,
  setSelectedBlockId
}: {
  block: ParsedReviewBlock;
  moveBlock: (blockId: string, targetField: ParsedReviewTarget) => void;
  selected: boolean;
  setSelectedBlockId: (blockId: string | null) => void;
}) {
  const theme = useAppTheme();

  return (
    <Surface
      elevation={selected ? 2 : 0}
      style={[
        styles.reviewBlockChip,
        {
          backgroundColor: selected ? theme.colors.primaryContainer : theme.colors.surfaceContainerHighest,
          borderColor: selected ? theme.colors.primary : 'rgba(127, 127, 127, 0.22)'
        }
      ]}
    >
      <Pressable
        onLongPress={() => setSelectedBlockId(selected ? null : block.id)}
        onPress={() => setSelectedBlockId(selected ? null : block.id)}
        style={styles.reviewBlockPressable}
        testID={`review-block-${block.id}`}
      >
        <View style={styles.reviewBlockTopRow}>
          <View
            style={[
              styles.reviewBlockSourceBadge,
              {
                backgroundColor: selected ? theme.colors.surface : theme.colors.surfaceContainer,
                borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant
              }
            ]}
          >
            <Text style={{ color: selected ? theme.colors.primary : theme.colors.onSurfaceVariant }} variant="labelSmall">
              {block.source === 'ocr' ? 'OCR' : 'Parsed'}
            </Text>
          </View>
          <MaterialCommunityIcons
            color={selected ? theme.colors.primary : theme.colors.onSurfaceVariant}
            name={selected ? 'check-circle-outline' : 'gesture-tap'}
            size={18}
          />
        </View>
        <Text numberOfLines={selected ? undefined : 2} style={{ color: selected ? theme.colors.onPrimaryContainer : theme.colors.onSurface }} variant="bodyMedium">
          {block.text}
        </Text>
        <Text style={{ color: selected ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }} variant="labelSmall">
          {selected ? 'Choose a field below' : 'Tap to assign this text'}
        </Text>
      </Pressable>
      {selected ? (
        <View style={styles.reviewBlockActions}>
          {parsedCardFields.map((field) => (
            <Button
              compact
              key={field.key}
              mode={block.assignedField === field.key ? 'contained-tonal' : 'text'}
              onPress={() => moveBlock(block.id, field.key)}
              testID={`move-${block.id}-to-${field.key}-button`}
            >
              {field.label}
            </Button>
          ))}
        </View>
      ) : null}
    </Surface>
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

function TeamScreen({
  isInviteCreationLoading,
  isTeamMembersLoading,
  currentUserId,
  members,
  team,
  teamPendingInvites,
  onCreateInvite,
  onPromoteMember
}: {
  currentUserId: string;
  isInviteCreationLoading: boolean;
  isTeamMembersLoading: boolean;
  members: TeamMember[];
  team: AccessibleTeam | null;
  teamPendingInvites: TeamWorkspaceState['teamPendingInvites'];
  onCreateInvite: (invitedEmail: string) => Promise<void>;
  onPromoteMember: (userId: string) => Promise<void>;
}) {
  const theme = useAppTheme();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [promotingMemberId, setPromotingMemberId] = useState<string | null>(null);
  const canManageTeam = team?.createdBy === currentUserId || members.some((member) => member.userId === currentUserId && member.isLeader);

  const handleCreateInvite = () => {
    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) {
      setInviteError('Enter an email to invite.');
      return;
    }

    void (async () => {
      setInviteError(null);

      try {
        await onCreateInvite(trimmedEmail);
        setInviteEmail('');
      } catch (error) {
        setInviteError(error instanceof Error ? error.message : 'Invite creation failed');
      }
    })();
  };

  const hasTeam = Boolean(team);
  const leaderCount = members.filter((member) => member.isLeader).length;
  const workerCount = members.length - leaderCount;

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <PageHeader
          kicker="Team workspace"
          status={hasTeam ? 'parsed' : 'idle'}
          summary={hasTeam ? `${members.length} members · ${leaderCount} leaders · ${workerCount} workers` : 'No team set up yet.'}
          title={team?.name ?? 'Team'}
        />
      </Animated.View>

      {hasTeam ? (
        <>
          {canManageTeam ? (
            <Animated.View entering={FadeInDown.delay(200).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
              <Surface
                elevation={1}
                style={[styles.managementPanel, { backgroundColor: theme.colors.surfaceContainer }]}
              >
                <View style={styles.teamSectionHeader}>
                  <Text variant="titleMedium">Pending invite</Text>
                </View>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  label="Invite email"
                  mode="outlined"
                  onChangeText={(value) => {
                    setInviteEmail(value);
                    setInviteError(null);
                  }}
                  placeholder="worker@example.com"
                  testID="invite-email-input"
                  value={inviteEmail}
                />
                <Button
                  disabled={isInviteCreationLoading || !team || !inviteEmail.trim()}
                  loading={isInviteCreationLoading}
                  mode="contained"
                  onPress={handleCreateInvite}
                  testID="create-invite-button"
                >
                  Send invite
                </Button>
                {inviteError ? (
                  <Text style={{ color: theme.colors.error }} variant="bodySmall">
                    {inviteError}
                  </Text>
                ) : null}
                {memberError ? (
                  <Text style={{ color: theme.colors.error }} variant="bodySmall">
                    {memberError}
                  </Text>
                ) : null}
                {teamPendingInvites.length > 0 ? (
                  <View style={styles.memberList}>
                    <Text variant="titleSmall">Pending invites</Text>
                    {teamPendingInvites.map((invite) => (
                      <Surface
                        key={invite.id}
                        elevation={0}
                        style={[styles.memberRow, { backgroundColor: theme.colors.surfaceContainerHighest }]}
                      >
                        <View style={styles.memberRowCopy}>
                          <Text variant="titleSmall">{invite.invitedEmail}</Text>
                          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                            Pending team invite
                          </Text>
                        </View>
                        <Button compact disabled mode="outlined">
                          Pending
                        </Button>
                      </Surface>
                    ))}
                  </View>
                ) : null}
              </Surface>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(230).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
            <Surface
              elevation={1}
              style={[styles.managementPanel, { backgroundColor: theme.colors.surfaceContainer }]}
            >
              <View style={styles.teamSectionHeader}>
                <Text variant="titleMedium">Members</Text>
              </View>
              {isTeamMembersLoading ? (
                <ActivityIndicator />
              ) : members.length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
                  No members found.
                </Text>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={styles.memberListScroll}
                  contentContainerStyle={styles.memberList}
                  testID="team-members-scroll"
                >
                  {members.map((member) => {
                    const isSelf = member.userId === currentUserId;
                    return (
                      <Surface
                        key={member.userId}
                        elevation={0}
                        style={[styles.memberRow, { backgroundColor: theme.colors.surfaceContainerHighest }]}
                      >
                        <View style={styles.memberRowCopy}>
                          <Text variant="titleSmall">{member.email}</Text>
                          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                            {isSelf ? 'You' : 'Member'}
                          </Text>
                        </View>
                        <View style={styles.memberActions}>
                          <Button compact disabled mode="outlined">
                            {member.isLeader ? 'Leader' : 'Worker'}
                          </Button>
                          {canManageTeam && !member.isLeader ? (
                            <Button
                              compact
                              disabled={Boolean(promotingMemberId)}
                              loading={promotingMemberId === member.userId}
                              mode="text"
                              onPress={() => {
                                setPromotingMemberId(member.userId);
                                setMemberError(null);
                                void onPromoteMember(member.userId)
                                  .catch((error) => {
                                    setMemberError(error instanceof Error ? error.message : 'Promotion failed');
                                  })
                                  .finally(() => setPromotingMemberId(null));
                              }}
                            >
                              Promote
                            </Button>
                          ) : null}
                        </View>
                      </Surface>
                    );
                  })}
                </ScrollView>
              )}
              {memberError ? (
                <Text style={{ color: theme.colors.error }} variant="bodySmall">
                  {memberError}
                </Text>
              ) : null}
            </Surface>
          </Animated.View>

        </>
      ) : null}
    </ScreenShell>
  );
}

function ProfileScreen({
  hasTeamWorkspace,
  isTeamCreationLoading,
  onCreateTeam,
  onSignOut,
  userEmail
}: {
  hasTeamWorkspace: boolean;
  isTeamCreationLoading: boolean;
  onCreateTeam: (teamName: string) => Promise<void>;
  onSignOut: () => void;
  userEmail: string | null | undefined;
}) {
  const theme = useAppTheme();
  const { colorMode, toggleColorMode } = useMaterialThemeControls();
  const {
    afterSaveBehavior,
    preferredScanMode,
    setAfterSaveBehavior,
    setPreferredScanMode
  } = useAppPreferences();
  const history = useScannerQueueStore((state) => state.history);
  const queue = useScannerQueueStore((state) => state.queue);
  const [teamName, setTeamName] = useState('');
  const [teamError, setTeamError] = useState<string | null>(null);
  const parsedCount = history.filter((item) => item.parseStatus === 'parsed').length;
  const inFlightCount = queue.filter((item) => item.status !== 'failed').length;
  const failedCount = queue.filter((item) => item.status === 'failed').length;

  const handleCreateTeam = () => {
    const trimmedName = teamName.trim();
    if (!trimmedName) {
      setTeamError('Enter a team name before creating one.');
      return;
    }

    void (async () => {
      setTeamError(null);

      try {
        await onCreateTeam(trimmedName);
        setTeamName('');
      } catch (error) {
        setTeamError(error instanceof Error ? error.message : 'Team creation failed');
      }
    })();
  };

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <PageHeader
          kicker="Account"
          status={failedCount > 0 ? 'failed' : inFlightCount > 0 ? 'saving' : parsedCount > 0 ? 'parsed' : 'idle'}
          summary={userEmail ?? 'your account'}
          title="Profile"
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        {!hasTeamWorkspace ? (
          <Surface
            elevation={1}
            style={[styles.managementPanel, { backgroundColor: theme.colors.surfaceContainer }]}
          >
            <View style={styles.teamSectionHeader}>
              <Text variant="titleMedium">Create your first team</Text>
            </View>
            <TextInput
              label="Team name"
              mode="outlined"
              onChangeText={(value) => {
                setTeamName(value);
                setTeamError(null);
              }}
              placeholder="North Hall"
              testID="profile-team-name-input"
              value={teamName}
            />
            <Button
              disabled={isTeamCreationLoading}
              loading={isTeamCreationLoading}
              mode="contained"
              onPress={handleCreateTeam}
              testID="profile-create-team-button"
            >
              Create team
            </Button>
            {teamError ? (
              <Text style={{ color: theme.colors.error }} variant="bodySmall">
                {teamError}
              </Text>
            ) : null}
          </Surface>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(210).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Surface
          elevation={1}
          style={[styles.palettePanel, { backgroundColor: theme.colors.surfaceContainer }]}
        >
          <View>
            <Text variant="titleMedium">Appearance</Text>
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

      <Animated.View entering={FadeInDown.delay(235).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Surface
          elevation={1}
          style={[styles.palettePanel, { backgroundColor: theme.colors.surfaceContainer }]}
        >
          <View style={styles.settingsSectionHeader}>
            <Text variant="titleMedium">Scanning</Text>
          </View>
          <View style={styles.settingsGroup}>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
              Scan start mode
            </Text>
            <View style={styles.settingsOptionsRow}>
              <Button compact mode={preferredScanMode === 'ask' ? 'contained-tonal' : 'outlined'} onPress={() => setPreferredScanMode('ask')}>
                Ask
              </Button>
              <Button compact mode={preferredScanMode === 'singleSided' ? 'contained-tonal' : 'outlined'} onPress={() => setPreferredScanMode('singleSided')}>
                Single
              </Button>
              <Button compact mode={preferredScanMode === 'doubleSided' ? 'contained-tonal' : 'outlined'} onPress={() => setPreferredScanMode('doubleSided')}>
                Double
              </Button>
            </View>
          </View>
          <View style={styles.settingsGroup}>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
              After save
            </Text>
            <View style={styles.settingsOptionsRow}>
              <Button compact mode={afterSaveBehavior === 'dashboard' ? 'contained-tonal' : 'outlined'} onPress={() => setAfterSaveBehavior('dashboard')}>
                Dashboard
              </Button>
              <Button compact mode={afterSaveBehavior === 'scan-again' ? 'contained-tonal' : 'outlined'} onPress={() => setAfterSaveBehavior('scan-again')}>
                Scan again
              </Button>
            </View>
          </View>
        </Surface>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(260).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
        <Button icon="logout" mode="outlined" onPress={onSignOut}>
          Sign out
        </Button>
      </Animated.View>
    </ScreenShell>
  );
}

function CameraScreen({
  allowGallery,
  afterSaveBehavior,
  captureMode,
  captureHint,
  captureTitle,
  captureProcessing,
  cameraFacing,
  handleCapture,
  handlePickFromGallery,
  handleTakePicture,
  hasPendingFrontSide,
  inFlightCount,
  isCapturing,
  onClose,
  onOpenQueue,
  onRotateCamera,
  onToggleAfterSaveBehavior,
  onToggleCaptureMode,
  permission,
  previewUri
}: {
  allowGallery: boolean;
  afterSaveBehavior: 'dashboard' | 'scan-again';
  captureMode: CardCaptureMode | null;
  captureHint: string;
  captureTitle: string;
  captureProcessing: CaptureProcessingState | null;
  cameraFacing: CameraFacing;
  handleCapture: (uri: string) => void;
  handlePickFromGallery: () => void;
  handleTakePicture: (camera: CameraView | null, captureFrame: CameraCaptureFrame | null) => Promise<string | null>;
  hasPendingFrontSide: boolean;
  inFlightCount: number;
  isCapturing: boolean;
  onClose: () => void;
  onOpenQueue: () => void;
  onRotateCamera: () => void;
  onToggleAfterSaveBehavior: () => void;
  onToggleCaptureMode: () => void;
  permission: { granted: boolean } | null;
  previewUri: string | null;
}) {
  const cameraRef = useRef<CameraView | null>(null);
  const theme = useAppTheme();
  const [viewport, setViewport] = useState<{ height: number; width: number } | null>(null);
  const [guideStageLayout, setGuideStageLayout] = useState<{ x: number; y: number } | null>(null);
  const [guideFrameLayout, setGuideFrameLayout] = useState<{ height: number; width: number; x: number; y: number } | null>(null);
  const viewportWidth = viewport?.width ?? 0;
  const viewportHeight = viewport?.height ?? 0;
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

  const captureFrame = viewport && guideStageLayout && guideFrameLayout
    ? {
        height: clampNumber(guideFrameLayout.height + CAMERA_CAPTURE_MARGIN * 2, 1, viewport.height),
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
        width: clampNumber(guideFrameLayout.width + CAMERA_CAPTURE_MARGIN * 2, 1, viewport.width),
        x: clampNumber(guideStageLayout.x + guideFrameLayout.x - CAMERA_CAPTURE_MARGIN, 0, viewport.width),
        y: clampNumber(CAMERA_GUIDE_TOP_OFFSET + guideStageLayout.y + guideFrameLayout.y - CAMERA_CAPTURE_MARGIN, 0, viewport.height)
      }
    : null;
  const visibleGuideFrame = viewport && guideStageLayout && guideFrameLayout
    ? {
        height: guideFrameLayout.height,
        width: guideFrameLayout.width,
        x: guideStageLayout.x + guideFrameLayout.x,
        y: CAMERA_GUIDE_TOP_OFFSET + guideStageLayout.y + guideFrameLayout.y
      }
    : null;

  const takePicture = useCallback(async () => {
    return handleTakePicture(cameraRef.current, captureFrame);
  }, [captureFrame, handleTakePicture]);
  const frameWidth = viewportWidth > 0
    ? Math.min(Math.max(viewportWidth - 112, 190), 280)
    : 240;
  const guideBottomOffset = CAMERA_GUIDE_BOTTOM_OFFSET;
  const frameAspectRatio = 0.58;

  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    const nextHeight = Math.round(event.nativeEvent.layout.height);

    setViewport((current) => {
      if (current?.width === nextWidth && current?.height === nextHeight) {
        return current;
      }

      return {
        height: nextHeight,
        width: nextWidth
      };
    });
  }, []);

  if (!permission) {
    return <View style={[styles.cameraContainer, { backgroundColor: theme.colors.surface }]} />;
  }

  if (!permission.granted) {
    return <PermissionDeniedScreen onGoBack={onClose} />;
  }

  const processingMessage = captureProcessing?.message ?? 'Hold steady while we take the photo.';
  const processingTitle = captureProcessing ? 'Saving scan' : 'Capturing photo';

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.medium1).easing(motion.easing.emphasized)}
      exiting={FadeOut.duration(motion.duration.short4).easing(motion.easing.standardExit)}
      onLayout={handleViewportLayout}
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
          <CameraView facing={cameraFacing} ref={cameraRef} style={StyleSheet.absoluteFill} testID="camera-viewfinder" />
          {visibleGuideFrame && viewportHeight > 0 ? (
            <View pointerEvents="none" style={styles.cameraBackdropTint}>
              <View style={[styles.cameraDimTop, { backgroundColor: 'rgba(25, 28, 34, 0.8)', height: visibleGuideFrame.y }]} />
              <View style={[styles.cameraDimMiddle, { height: visibleGuideFrame.height }]}>
                <View style={[styles.cameraDimSide, { backgroundColor: 'rgba(25, 28, 34, 0.8)', width: visibleGuideFrame.x }]} />
                <View style={{ height: visibleGuideFrame.height, width: visibleGuideFrame.width }} />
                <View style={[styles.cameraDimSide, { backgroundColor: 'rgba(25, 28, 34, 0.8)', flex: 1 }]} />
              </View>
              <View style={[styles.cameraDimBottom, { backgroundColor: 'rgba(25, 28, 34, 0.8)' }]} />
            </View>
          ) : null}
          <Animated.View
            entering={FadeInDown.delay(80).duration(motion.duration.medium1).easing(motion.easing.emphasized)}
            style={styles.cameraTopBar}
          >
            <IconButton
              accessibilityLabel="Close camera"
              containerColor="rgba(10, 19, 44, 0.14)"
              icon="close"
              iconColor={theme.colors.surface}
              mode="contained"
              onPress={onClose}
              size={26}
              testID="close-camera-button"
            />
            <IconButton
              accessibilityLabel="Camera guide"
              containerColor="rgba(10, 19, 44, 0.14)"
              icon="qrcode-scan"
              iconColor={theme.colors.surface}
              mode="contained"
              onPress={onOpenQueue}
              size={24}
            />
          </Animated.View>
          <View style={[styles.cameraGuidance, { bottom: guideBottomOffset }]} pointerEvents="none">
            <View
              onLayout={(event) => {
                const { x, y } = event.nativeEvent.layout;
                setGuideStageLayout((current) => {
                  const next = { x: Math.round(x), y: Math.round(y) };
                  return current?.x === next.x && current?.y === next.y ? current : next;
                });
              }}
              style={styles.cameraGuideStage}
            >
              <View
                onLayout={(event) => {
                  const { height, width, x, y } = event.nativeEvent.layout;
                  setGuideFrameLayout((current) => {
                    const next = {
                      height: Math.round(height),
                      width: Math.round(width),
                      x: Math.round(x),
                      y: Math.round(y)
                    };
                    return current?.height === next.height && current?.width === next.width && current?.x === next.x && current?.y === next.y
                      ? current
                      : next;
                  });
                }}
                style={[styles.cameraGuideFrame, { aspectRatio: frameAspectRatio, width: frameWidth }]}
              >
                <View
                  style={[
                    styles.cameraGuideFill,
                    { backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)' }
                  ]}
                />
                <View style={styles.cameraGuideRow}>
                  <View style={styles.cameraGuideCornerTopLeft} />
                  <View style={styles.cameraGuideCornerTopRight} />
                </View>
                <View style={styles.cameraGuideRowBottom}>
                  <View style={styles.cameraGuideCornerBottomLeft} />
                  <View style={styles.cameraGuideCornerBottomRight} />
                </View>
              </View>
            </View>
            <View style={styles.cameraGuideCopy}>
              <View
                style={[
                  styles.cameraModeBadge,
                  { backgroundColor: 'rgba(255,255,255,0.18)' }
                ]}
              >
                <MaterialCommunityIcons color={theme.colors.surface} name="card-account-details-outline" size={16} />
                <Text style={{ color: theme.colors.surface }} variant="labelMedium">
                  {hasPendingFrontSide ? 'Back side' : 'Front side'}
                </Text>
              </View>
              <Text style={styles.cameraGuideTitle} variant="titleMedium">
                {hasPendingFrontSide ? captureTitle : 'Fit the card in frame'}
              </Text>
              <Text style={styles.cameraGuideSubtitle} variant="bodySmall">
                Keep the card vertical and place all four edges inside the corners.
              </Text>
            </View>
          </View>
          <CaptureButton
            disabled={isCapturing || Boolean(captureProcessing)}
            onCapture={handleCapture}
            placement="bottom"
            takePicture={takePicture}
          />
          {isCapturing || captureProcessing ? (
            <View style={styles.captureProcessingOverlay} pointerEvents="none" testID="capture-processing-overlay">
              <Surface elevation={2} style={[styles.captureProcessingCard, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
                <ActivityIndicator />
                <Text style={styles.captureProcessingTitle} variant="titleMedium">
                  {processingTitle}
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }} variant="bodyMedium">
                  {processingMessage}
                </Text>
                {captureProcessing?.timedOut ? (
                  <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }} variant="bodySmall">
                    The scan will keep retrying in the background.
                  </Text>
                ) : null}
              </Surface>
            </View>
          ) : null}
          <View style={[styles.cameraBottomTray, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
            <View style={[styles.cameraTraySection, styles.cameraTraySectionLeft]}>
              {__DEV__ && allowGallery ? (
                <Pressable
                  onPress={handlePickFromGallery}
                  style={({ pressed }) => [
                    styles.cameraTrayItem,
                    pressed && styles.cameraTrayItemPressed
                  ]}
                  testID="pick-from-gallery-button"
                >
                  <MaterialCommunityIcons color={theme.colors.onSurfaceVariant} name="image-multiple-outline" size={24} />
                  <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                    Images
                  </Text>
                </Pressable>
              ) : (
                <View style={[styles.cameraTrayItem, styles.cameraTrayItemDisabled]}>
                  <MaterialCommunityIcons color={theme.colors.onSurfaceVariant} name="image-multiple-outline" size={24} />
                  <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                    Images
                  </Text>
                </View>
              )}
              <Pressable
                onPress={onRotateCamera}
                style={({ pressed }) => [
                  styles.cameraTrayItem,
                  pressed && styles.cameraTrayItemPressed
                ]}
                testID="rotate-camera-button"
              >
                <MaterialCommunityIcons color={theme.colors.onSurfaceVariant} name="camera-flip-outline" size={24} />
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelMedium">
                  Rotate
                </Text>
              </Pressable>
            </View>
            <View style={styles.cameraTrayCaptureSpacer} />
            <View style={[styles.cameraTraySection, styles.cameraTraySectionRight]}>
              <Pressable
                onPress={onToggleCaptureMode}
                style={({ pressed }) => [
                  styles.cameraTrayItem,
                  styles.cameraTrayModeItem,
                  { backgroundColor: captureMode === 'doubleSided' ? '#C6F500' : 'transparent' },
                  pressed && styles.cameraTrayItemPressed
                ]}
                testID="toggle-capture-mode-button"
              >
                <MaterialCommunityIcons
                  color={captureMode === 'doubleSided' ? '#0B0D0E' : theme.colors.onSurfaceVariant}
                  name={captureMode === 'doubleSided' ? 'card-bulleted-outline' : 'card-account-details-outline'}
                  size={24}
                />
                <Text style={{ color: captureMode === 'doubleSided' ? '#0B0D0E' : theme.colors.onSurfaceVariant }} variant="labelMedium">
                  {captureMode === 'doubleSided' ? 'Both' : 'Single'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onToggleAfterSaveBehavior}
              style={({ pressed }) => [
                styles.cameraTrayItem,
                styles.cameraTrayModeItem,
                styles.cameraTrayBatchItem,
                { backgroundColor: afterSaveBehavior === 'scan-again' ? '#C6F500' : 'transparent' },
                pressed && styles.cameraTrayItemPressed
              ]}
              testID="toggle-after-save-behavior-button"
            >
              <MaterialCommunityIcons
                color={afterSaveBehavior === 'scan-again' ? '#0B0D0E' : theme.colors.onSurfaceVariant}
                name={afterSaveBehavior === 'scan-again' ? 'layers-triple-outline' : 'checkbox-blank-circle-outline'}
                size={24}
              />
              <Text
                style={{ color: afterSaveBehavior === 'scan-again' ? '#0B0D0E' : theme.colors.onSurfaceVariant }}
                variant="labelMedium"
              >
                {afterSaveBehavior === 'scan-again' ? 'Batch' : 'Single'}
                </Text>
              </Pressable>
            </View>
          </View>
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
    <View style={styles.metricRail}>
      {items.map((item) => {
        const toneColor = item.tone === 'error'
          ? theme.colors.error
          : item.tone === 'secondary'
            ? theme.colors.secondary
            : item.tone === 'tertiary'
              ? theme.colors.tertiary
              : theme.colors.primary;

        return (
          <Surface
            elevation={0}
            key={item.label}
            style={[styles.metricRailItem, { backgroundColor: theme.colors.surfaceContainer }]}
          >
            <Text style={{ color: toneColor }} variant="headlineSmall">
              {item.value}
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="labelLarge">
              {item.label}
            </Text>
          </Surface>
        );
      })}
    </View>
  );
}

function ScannerApp({
  onSignOut,
  workspace,
  session
}: {
  onSignOut: () => void;
  workspace: TeamWorkspaceState;
  session: Session;
}) {
  const { afterSaveBehavior, preferredScanMode, setAfterSaveBehavior } = useAppPreferences();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [previousTabIndex, setPreviousTabIndex] = useState(0);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isBatchApprovalConfirmOpen, setIsBatchApprovalConfirmOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [selectedReassignItem, setSelectedReassignItem] = useState<TeamInboxItem | null>(null);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<TeamInboxItem | null>(null);
  const [isSavingParsedReview, setIsSavingParsedReview] = useState(false);
  const [pendingScanReview, setPendingScanReview] = useState<PendingScanReview | null>(null);
  const [captureMode, setCaptureMode] = useState<CardCaptureMode | null>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('back');
  const [pendingFrontSide, setPendingFrontSide] = useState<(CapturedCardSide & { leadId: string }) | null>(null);
  const [captureProcessing, setCaptureProcessing] = useState<CaptureProcessingState | null>(null);
  const {
    addBatchItem,
    createTeam,
    approveBatch,
    createBatch,
    createInvite,
    hasTeamWorkspace,
    historyTeamId,
    historyTeamName,
    historyItems,
    historyMode,
    isBatchActionLoading,
    isAssignmentReassignmentLoading,
    isTeamCreationLoading,
    isTeamMembersLoading,
    isTeamsLoading,
    isHistoryLoading,
    isInviteCreationLoading,
    pendingBatchId,
    pendingBatchItems,
    pendingBatchScanCount,
    pendingBatchAllocations,
    updatePendingBatchAllocation,
    teamPendingInvites,
    members,
    team,
    promoteMember,
    reassignAssignment,
    removeBatchItem,
    updateAssignmentState,
    updateLeadDetails,
    hasMoreHistory,
    loadMoreHistory,
    isLoadingMoreHistory
  } = workspace;
  const captureLockRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const captureProcessingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCaptureCropRef = useRef<ImageCropRegion | null>(null);
  const queueSheetRef = useRef<BottomSheetModalHandle>(null);
  const batchSheetRef = useRef<BottomSheetModalHandle>(null);
  const reassignSheetRef = useRef<BottomSheetModalHandle>(null);
  const isDrainingRef = useRef(false);
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const isConnected = NetInfo.useNetInfo().isConnected;

  const queue = useScannerQueueStore((state) => state.queue);
  const history = useScannerQueueStore((state) => state.history);
  const systemNotice = useScannerQueueStore((state) => state.systemNotice);
  const recordHistory = useScannerQueueStore((state) => state.recordHistory);
  const clearSystemNotice = useScannerQueueStore((state) => state.clearSystemNotice);
  const retry = useScannerQueueStore((state) => state.retry);
  const drainOnce = useScannerQueueStore((state) => state.drainOnce);

  const inFlightCount = queue.filter((item) => item.status !== 'failed').length;
  const failedCount = queue.filter((item) => item.status === 'failed').length;
  const captureTeamId = team?.id ?? null;
  const displayActiveTeamName = team?.name ?? null;
  const isPersonalHistory = !historyTeamId;
  const historyRoute = isPersonalHistory
    ? { focusedIcon: 'clock', title: 'History', unfocusedIcon: 'clock-outline' }
    : historyMode === 'leader-inbox'
      ? { focusedIcon: 'inbox', title: 'Inbox', unfocusedIcon: 'inbox-outline' }
      : { focusedIcon: 'clipboard-account', title: 'Assignments', unfocusedIcon: 'clipboard-account-outline' };
  const modeAwareRoutes = routes.map((route) =>
    route.key === 'history'
      ? { ...route, ...historyRoute }
      : route
  );
  const visibleRoutes = modeAwareRoutes.filter((route) => (
    hasTeamWorkspace
      ? route.key !== 'queue'
      : route.key !== 'team'
  ));
  const activeIndex = visibleRoutes.findIndex((route) => route.key === activeTab);
  const pageDirection = activeIndex >= previousTabIndex ? 1 : -1;
  const dashboardStatus: OcrStatus = failedCount > 0
    ? 'failed'
    : inFlightCount > 0
      ? 'saving'
      : history.some((item) => item.parseStatus === 'parsed')
        ? 'parsed'
        : 'idle';
  const captureTitle = captureMode === 'doubleSided' && pendingFrontSide ? 'Capture back side' : 'Capture front side';
  const captureHint = captureMode === 'doubleSided'
    ? pendingFrontSide
      ? 'Flip the same card and capture the back side.'
      : 'Start with the front side that shows the name or company.'
    : 'Align the card clearly and capture one side.';
  const clearCaptureProcessingTimeout = useCallback(() => {
    if (captureProcessingTimeoutRef.current) {
      clearTimeout(captureProcessingTimeoutRef.current);
      captureProcessingTimeoutRef.current = null;
    }
  }, []);
  const stopCaptureProcessing = useCallback(() => {
    clearCaptureProcessingTimeout();
    setCaptureProcessing(null);
  }, [clearCaptureProcessingTimeout]);
  const startCaptureProcessing = useCallback((message: string) => {
    clearCaptureProcessingTimeout();
    setCaptureProcessing({
      message,
      timedOut: false
    });

    captureProcessingTimeoutRef.current = setTimeout(() => {
      setCaptureProcessing((current) => {
        if (!current) {
          return current;
        }

        return {
          message: 'This is taking longer than usual. The scan will stay queued if the connection drops.',
          timedOut: true
        };
      });
    }, CAPTURE_PROCESSING_TIMEOUT_MS);
  }, [clearCaptureProcessingTimeout]);
  const queueCaptureFallback = useCallback((params: {
    cachePath: string;
    cachePaths?: string[];
    leadId: string;
    rawText: string;
    storagePath?: string;
    storagePaths?: string[];
    uploadLeadIds?: string[];
    teamId: string | null;
  }) => {
    scannerQueueStore.getState().enqueue({
      id: params.leadId,
      imagePath: params.cachePath,
      ...(params.cachePaths?.length ? { imagePaths: params.cachePaths } : {}),
      rawText: params.rawText,
      ...(params.storagePath ? { storagePath: params.storagePath } : {}),
      ...(params.storagePaths?.length ? { storagePaths: params.storagePaths } : {}),
      ...(params.uploadLeadIds?.length ? { uploadLeadIds: params.uploadLeadIds } : {}),
      teamId: params.teamId
    });

    if (params.storagePath) {
      scannerQueueStore.getState().markUploaded(
        params.leadId,
        params.storagePaths?.length ? params.storagePaths : params.storagePath
      );
    }
  }, []);
  const closeCamera = useCallback(() => {
    captureGenerationRef.current += 1;
    stopCaptureProcessing();
    setCameraFacing('back');
    setPreviewUri(null);
    if (pendingFrontSide) {
      void cleanupRemoteCardImages([pendingFrontSide.storagePath]);
      void cleanupLocalCardImages([pendingFrontSide.cachePath]);
    }
    setPendingFrontSide(null);
    setCaptureMode(null);
    setIsCameraOpen(false);
  }, [pendingFrontSide, stopCaptureProcessing]);
  const toggleCaptureMode = useCallback(() => {
    if (pendingFrontSide) {
      Alert.alert('Finish current scan first', 'Capture the back side or close the camera before switching modes.');
      return;
    }

    setCaptureMode((current) => current === 'doubleSided' ? 'singleSided' : 'doubleSided');
  }, [pendingFrontSide]);
  const toggleAfterSaveBehavior = useCallback(() => {
    setAfterSaveBehavior(afterSaveBehavior === 'scan-again' ? 'dashboard' : 'scan-again');
  }, [afterSaveBehavior, setAfterSaveBehavior]);
  const visibleHistoryItems = isPersonalHistory
    ? history.map((item) => scannerHistoryToInboxItem(item, session.user.id))
    : historyItems;

  useEffect(() => {
    if (isCameraOpen && !permission) {
      void requestPermission();
    }
  }, [isCameraOpen, permission, requestPermission]);

  useEffect(() => {
    if (!isCameraOpen) {
      return undefined;
    }

    const refreshCameraPermission = (nextState: AppStateStatus): void => {
      if (nextState === 'active') {
        void getPermission();
      }
    };

    const subscription = AppState.addEventListener('change', refreshCameraPermission);
    return () => {
      subscription.remove();
    };
  }, [getPermission, isCameraOpen]);

  useEffect(() => {
    if (!hasTeamWorkspace && activeTab === 'team') {
      setActiveTab('profile');
      return;
    }

    if (hasTeamWorkspace && activeTab === 'queue') {
      setActiveTab('team');
    }
  }, [activeTab, hasTeamWorkspace]);
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

  useEffect(() => {
    if (isConnected === false) {
      return;
    }

    const nextAttemptAt = queue
      .map((item) => item.nextAttemptAt)
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right)[0];

    if (typeof nextAttemptAt !== 'number') {
      return;
    }

    const waitMs = Math.max(nextAttemptAt - Date.now(), 0);
    const timeoutId = setTimeout(() => {
      if (isDrainingRef.current) {
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
    }, waitMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [drainOnce, isConnected, queue]);

  useEffect(() => () => {
    clearCaptureProcessingTimeout();
  }, [clearCaptureProcessingTimeout]);

  const handleTakePicture = useCallback(async (camera: CameraView | null, captureFrame: CameraCaptureFrame | null): Promise<string | null> => {
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
      pendingCaptureCropRef.current = createCropRegionForFrame(capturedPhoto?.width, capturedPhoto?.height, captureFrame);

      return capturedPhoto?.uri ?? null;
    } finally {
      captureLockRef.current = false;
      setIsCapturing(false);
    }
  }, []);

  const handleCapture = useCallback((uri: string): void => {
    const captureGeneration = captureGenerationRef.current + 1;
    captureGenerationRef.current = captureGeneration;
    setPreviewUri(uri);
    startCaptureProcessing('Preparing scan');

    void (async () => {
      const localCleanupPaths = new Set<string>();
      const remoteCleanupPaths = new Set<string>();
      let cachePath: string | null = null;
      let rawText = '';
      let currentCapturedSide: CapturedCardSide | null = null;
      let leadId = pendingFrontSide?.leadId ?? createUuid();
      const selectedMode = captureMode ?? 'singleSided';
      const side: CardSide = selectedMode === 'doubleSided' && pendingFrontSide ? 'back' : 'front';
      const imageLeadId = selectedMode === 'doubleSided' ? `${leadId}-${side}` : leadId;

      try {
        const cropRegion = pendingCaptureCropRef.current;
        pendingCaptureCropRef.current = null;
        const preparedImage = await prepareImage(uri, imageLeadId, cropRegion);
        cachePath = preparedImage.cachePath;
        localCleanupPaths.add(cachePath);

        if (captureGenerationRef.current !== captureGeneration) {
          return;
        }

        setCaptureProcessing((current) => current ? { ...current, message: 'Reading card text' } : current);
        rawText = await extractText(cachePath);

        if (captureGenerationRef.current !== captureGeneration) {
          return;
        }

        setCaptureProcessing((current) => current ? { ...current, message: 'Saving image to cloud' } : current);
        const storagePath = await withTimeout(
          uploadCardImage(cachePath, imageLeadId),
          CAPTURE_CLOUD_STEP_TIMEOUT_MS,
          'Uploading scanned card timed out.'
        );
        remoteCleanupPaths.add(storagePath);

        if (captureGenerationRef.current !== captureGeneration) {
          return;
        }

        currentCapturedSide = {
          cachePath,
          rawText,
          side,
          storagePath,
          uploadLeadId: imageLeadId
        };

        if (selectedMode === 'doubleSided' && !pendingFrontSide) {
          setPendingFrontSide({
            ...currentCapturedSide,
            leadId
          });
          localCleanupPaths.delete(cachePath);
          remoteCleanupPaths.delete(storagePath);
          setPreviewUri(null);
          return;
        }

        const capturedSides = pendingFrontSide && currentCapturedSide
          ? [
              {
              cachePath: pendingFrontSide.cachePath,
              rawText: pendingFrontSide.rawText,
              side: pendingFrontSide.side,
              storagePath: pendingFrontSide.storagePath,
              uploadLeadId: pendingFrontSide.uploadLeadId
            },
            currentCapturedSide
          ]
          : currentCapturedSide
            ? [currentCapturedSide]
            : [];

        if (capturedSides.length === 0) {
          throw new Error('Capture payload missing');
        }

        const rawTextForReview = selectedMode === 'doubleSided'
          ? formatCardSideRawText(capturedSides)
          : rawText;
        const storagePaths = capturedSides.map((cardSide) => cardSide.storagePath);
        const cachePaths = capturedSides.map((cardSide) => cardSide.cachePath);
        const uploadLeadIds = capturedSides.map((cardSide) => cardSide.uploadLeadId);
        cachePaths.forEach((path) => localCleanupPaths.delete(path));
        storagePaths.forEach((path) => remoteCleanupPaths.delete(path));

        setCaptureProcessing((current) => current ? { ...current, message: 'Parsing card details' } : current);
        const parsedPreview = await withTimeout(
          parseCardPreview({
            imagePath: storagePaths[0],
            ...(storagePaths.length > 1 ? { imagePaths: storagePaths } : {}),
            leadId,
            rawText: rawTextForReview,
            teamId: captureTeamId
          }),
          CAPTURE_CLOUD_STEP_TIMEOUT_MS,
          'Parsing scanned card timed out.'
        );

        if (captureGenerationRef.current !== captureGeneration) {
          return;
        }

        setPendingScanReview({
          cachePath: cachePaths[0],
          cachePaths,
          leadId,
          parsed: parsedPreview.parsed,
          parseStatus: parsedPreview.parseStatus,
          rawText: rawTextForReview,
          storagePath: storagePaths[0],
          storagePaths,
          uploadLeadIds,
          teamId: captureTeamId
        });
        setPendingFrontSide(null);
        setIsCameraOpen(false);
      } catch (error) {
        if (captureGenerationRef.current !== captureGeneration) {
          return;
        }

        if (error instanceof BlurryImageError) {
          await cleanupRemoteCardImages(Array.from(remoteCleanupPaths));
          await cleanupLocalCardImages(Array.from(localCleanupPaths));
          Alert.alert('Image too blurry, retake');
          return;
        }

        if (cachePath && isRetryableCaptureError(error)) {
          const queuedRawText = selectedMode === 'doubleSided' && pendingFrontSide && currentCapturedSide
            ? formatCardSideRawText([
                {
                  cachePath: pendingFrontSide.cachePath,
                  rawText: pendingFrontSide.rawText,
                  side: pendingFrontSide.side,
                  storagePath: pendingFrontSide.storagePath,
                  uploadLeadId: pendingFrontSide.uploadLeadId
                },
                currentCapturedSide
              ])
            : currentCapturedSide?.rawText ?? rawText;

          if (queuedRawText.trim().length > 0) {
            const queuedImagePaths = pendingFrontSide && currentCapturedSide
              ? [pendingFrontSide.cachePath, currentCapturedSide.cachePath]
              : currentCapturedSide
                ? [currentCapturedSide.cachePath]
                : [cachePath];
            const queuedStoragePaths = pendingFrontSide && currentCapturedSide
              ? [pendingFrontSide.storagePath, currentCapturedSide.storagePath]
              : currentCapturedSide?.storagePath
                ? [currentCapturedSide.storagePath]
                : undefined;
            const queuedUploadLeadIds = pendingFrontSide && currentCapturedSide
              ? [pendingFrontSide.uploadLeadId, currentCapturedSide.uploadLeadId]
              : currentCapturedSide
                ? [currentCapturedSide.uploadLeadId]
                : pendingFrontSide
                  ? [pendingFrontSide.uploadLeadId]
                  : [imageLeadId];

            queueCaptureFallback({
              cachePath,
              cachePaths: queuedImagePaths,
              leadId,
              rawText: queuedRawText,
              ...(queuedStoragePaths ? { storagePaths: queuedStoragePaths, storagePath: queuedStoragePaths[0] } : {}),
              uploadLeadIds: queuedUploadLeadIds,
              teamId: captureTeamId
            });
            setPendingFrontSide(null);
            setPendingScanReview(null);
            setCaptureMode(null);
            setIsCameraOpen(false);
            Alert.alert(
              'Saved offline',
              currentCapturedSide?.storagePath
                ? 'The scan is queued to finish parsing in the background.'
                : 'The scan is queued and will finish when the connection returns.'
            );
            return;
          }
        }

        await cleanupRemoteCardImages(Array.from(remoteCleanupPaths));
        await cleanupLocalCardImages(Array.from(localCleanupPaths));

        console.error('Capture pipeline failed', error);
        Alert.alert('Scan failed', 'Please try again');
      } finally {
        if (captureGenerationRef.current === captureGeneration) {
          setPreviewUri(null);
          stopCaptureProcessing();
        }
      }
    })();
  }, [captureMode, captureTeamId, pendingFrontSide, queueCaptureFallback, startCaptureProcessing, stopCaptureProcessing]);

  const savePendingScanReview = useCallback((parsed: ParsedCard) => {
    if (!pendingScanReview) {
      return;
    }

    setIsSavingParsedReview(true);
    void (async () => {
      try {
        let savedScan: { parsed: ParsedCard; parseStatus: ParseStatus };

        try {
          savedScan = await withTimeout(
            saveParsedCard({
              imagePath: pendingScanReview.storagePath,
              imagePaths: pendingScanReview.storagePaths,
              leadId: pendingScanReview.leadId,
              parsed,
              rawText: pendingScanReview.rawText,
              teamId: pendingScanReview.teamId
            }),
            REVIEW_SAVE_TIMEOUT_MS,
            'Saving the reviewed card timed out.'
          );
        } catch (error) {
          await withTimeout(
            updateExistingReviewedLead(pendingScanReview.leadId, parsed),
            REVIEW_SAVE_TIMEOUT_MS,
            'Updating the reviewed card timed out.'
          );
          savedScan = {
            parsed,
            parseStatus: getLocalParseStatus(parsed)
          };
        }

        const archivedImagePath = await archiveReviewedImage(pendingScanReview.cachePath, pendingScanReview.leadId);
        recordHistory({
          id: pendingScanReview.leadId,
          imagePath: archivedImagePath,
          parsed: savedScan.parsed,
          parseStatus: savedScan.parseStatus,
          rawText: pendingScanReview.rawText,
          storagePath: pendingScanReview.storagePath
        });

        await cleanupLocalCardImages(pendingScanReview.cachePaths);
        setPendingScanReview(null);
        setPendingFrontSide(null);
        setCaptureMode(null);
        if (afterSaveBehavior === 'scan-again') {
          setCaptureMode(preferredScanMode === 'ask' ? 'singleSided' : preferredScanMode);
          setIsCameraOpen(true);
        }
      } catch (error) {
        console.warn('Reviewed scan save failed', error);
        Alert.alert('Save failed', 'Please check your connection and try again.');
      } finally {
        setIsSavingParsedReview(false);
      }
    })();
  }, [afterSaveBehavior, pendingScanReview, preferredScanMode, recordHistory]);

  const retakePendingScanReview = useCallback(() => {
    if (pendingScanReview) {
      void cleanupRemoteCardImages(pendingScanReview.storagePaths);
      void cleanupLocalCardImages(pendingScanReview.cachePaths);
    }

    captureGenerationRef.current += 1;
    setPendingScanReview(null);
    setPendingFrontSide(null);
    setIsSavingParsedReview(false);
    setIsCameraOpen(true);
  }, [pendingScanReview]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pendingScanReview && !isSavingParsedReview) {
        Alert.alert(
          'Discard this scan?',
          'Going back will throw away the current review and reopen the camera.',
          [
            {
              style: 'cancel',
              text: 'Keep reviewing'
            },
            {
              style: 'destructive',
              text: 'Discard',
              onPress: retakePendingScanReview
            }
          ]
        );
        return true;
      }

      if (isCameraOpen) {
        closeCamera();
        return true;
      }

      return false;
    });

    return () => {
      subscription.remove();
    };
  }, [closeCamera, isCameraOpen, isSavingParsedReview, pendingScanReview, retakePendingScanReview]);

  const addBackSideToPendingReview = useCallback(() => {
    if (!pendingScanReview || pendingScanReview.cachePaths.length !== 1 || pendingScanReview.storagePaths.length !== 1) {
      return;
    }

    captureGenerationRef.current += 1;
    setPreviewUri(null);
    setPendingFrontSide({
      cachePath: pendingScanReview.cachePaths[0],
      leadId: pendingScanReview.leadId,
      rawText: pendingScanReview.rawText,
      side: 'front',
      storagePath: pendingScanReview.storagePaths[0],
      uploadLeadId: pendingScanReview.uploadLeadIds[0] ?? pendingScanReview.leadId
    });
    setPendingScanReview(null);
    setCaptureMode('doubleSided');
    setIsCameraOpen(true);
  }, [pendingScanReview]);

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

  const startCaptureMode = useCallback((mode: CardCaptureMode) => {
    setCaptureMode(mode);
    setPendingFrontSide(null);
    setIsCameraOpen(true);
  }, []);

  const openCamera = useCallback(() => {
    startCaptureMode(preferredScanMode === 'ask' ? 'singleSided' : preferredScanMode);
  }, [preferredScanMode, startCaptureMode]);

  const openBatchEditor = useCallback(() => {
    batchSheetRef.current?.present();
  }, []);

  const openReassignSheet = useCallback((item: TeamInboxItem) => {
    setSelectedReassignItem(item);
    reassignSheetRef.current?.present();
  }, []);

  const handleReassignSelection = useCallback(
    async (scannedLeadId: string, targetUserId: string): Promise<void> => {
      await reassignAssignment(scannedLeadId, targetUserId);
      reassignSheetRef.current?.dismiss();
      setSelectedReassignItem(null);
    },
    [reassignAssignment]
  );

  const pendingBatchItemSet = new Set(pendingBatchItems.map((item) => item.scannedLeadId));
  const pendingBatchCards = visibleHistoryItems.filter((item) => pendingBatchItemSet.has(item.id));
  const pendingBatchAvailableCards = visibleHistoryItems.filter(
    (item) => !pendingBatchItemSet.has(item.id) && !item.assignmentState
  );
  const workerMembers = members.filter((member) => !member.isLeader);
  const pendingBatchAssignedCount = pendingBatchAllocations.reduce((total, allocation) => total + allocation.count, 0);
  const canApprovePendingBatch =
    Boolean(pendingBatchId)
    && pendingBatchCards.length > 0
    && workerMembers.length > 0
    && pendingBatchAssignedCount === pendingBatchCards.length;

  const handleTabChange = useCallback((nextTab: AppTab) => {
    if (nextTab === activeTab) {
      return;
    }

    setSelectedHistoryItem(null);
    setPreviousTabIndex(activeIndex >= 0 ? activeIndex : 0);
    setActiveTab(nextTab);
  }, [activeIndex, activeTab]);

  const renderScene = useCallback(
    ({ route }: { route: { key: string } }) => {
      switch (route.key) {
        case 'history':
          if (isBatchApprovalConfirmOpen) {
            return (
              <BatchApprovalConfirmScreen
                allocations={pendingBatchAllocations}
                scanCount={pendingBatchCards.length}
                workerCount={workerMembers.length}
                workers={workerMembers}
                onApprove={() => {
                  void (async () => {
                    await approveBatch(pendingBatchAllocations);
                    setIsBatchApprovalConfirmOpen(false);
                  })().catch((error) => {
                    console.warn('Batch approval failed', error);
                    Alert.alert('Batch approval failed', 'Please try again.');
                  });
                }}
                onBack={() => setIsBatchApprovalConfirmOpen(false)}
              />
            );
          }

          if (selectedHistoryItem) {
            const memberLabel = selectedHistoryItem.assignedToUserId
              ? members.find((member) => member.userId === selectedHistoryItem.assignedToUserId)?.email ?? null
              : null;

            return (
              <AssignmentDetailScreen
                item={selectedHistoryItem}
                isPersonalHistory={isPersonalHistory}
                memberLabel={memberLabel}
                mode={historyMode}
                onBack={() => setSelectedHistoryItem(null)}
                onOpenReassignAssignment={openReassignSheet}
                onUpdateLeadDetails={updateLeadDetails}
                onUpdateAssignmentState={updateAssignmentState}
              />
            );
          }

          return (
            <HistoryScreen
              canApproveBatch={canApprovePendingBatch}
              canCreateBatch={Boolean(historyTeamId && !pendingBatchId && pendingBatchAvailableCards.length > 0)}
              canEditBatch={Boolean(pendingBatchId)}
              members={members}
              teamName={historyTeamName}
              isBatchActionLoading={isBatchActionLoading}
              isLoading={isHistoryLoading}
              isPersonalHistory={isPersonalHistory}
              items={visibleHistoryItems}
              mode={historyMode}
              hasMore={isPersonalHistory ? false : hasMoreHistory}
              onLoadMore={loadMoreHistory}
              isLoadingMore={isLoadingMoreHistory}
              onApproveBatch={() => setIsBatchApprovalConfirmOpen(true)}
              onEditBatch={openBatchEditor}
              onCreateBatch={createBatch}
              onUpdateAssignmentState={updateAssignmentState}
              onOpenReassignAssignment={openReassignSheet}
              onOpenItem={setSelectedHistoryItem}
              onOpenCamera={openCamera}
            />
          );
        case 'team':
          if (!hasTeamWorkspace) {
            return (
              <ProfileScreen
                hasTeamWorkspace={hasTeamWorkspace}
                isTeamCreationLoading={isTeamCreationLoading}
                onCreateTeam={createTeam}
                onSignOut={onSignOut}
                userEmail={session.user.email}
              />
            );
          }

          return (
            <TeamScreen
              currentUserId={session.user.id}
              isInviteCreationLoading={isInviteCreationLoading}
              isTeamMembersLoading={isTeamMembersLoading}
              members={members}
              team={team}
              teamPendingInvites={teamPendingInvites}
              onCreateInvite={createInvite}
              onPromoteMember={promoteMember}
            />
          );
        case 'queue':
          return (
            <QueueScreen
              items={queue}
              onOpenCamera={openCamera}
              onRetry={retry}
            />
          );
        case 'profile':
          return (
            <ProfileScreen
              hasTeamWorkspace={hasTeamWorkspace}
              isTeamCreationLoading={isTeamCreationLoading}
              onCreateTeam={createTeam}
              onSignOut={onSignOut}
              userEmail={session.user.email}
            />
          );
        case 'dashboard':
        default:
          return (
            <DashboardScreen
              activeTeamName={displayActiveTeamName}
              failedCount={failedCount}
              hasTeamWorkspace={hasTeamWorkspace}
              history={history}
              historyLabel={historyRoute.title}
              inFlightCount={inFlightCount}
              onOpenCamera={openCamera}
              onOpenHistory={openHistory}
              status={dashboardStatus}
            />
          );
      }
    },
      [
        dashboardStatus,
        failedCount,
        history,
        hasTeamWorkspace,
        historyTeamId,
        historyTeamName,
        historyItems,
        historyMode,
        isBatchActionLoading,
        isAssignmentReassignmentLoading,
        isTeamsLoading,
        isTeamMembersLoading,
        inFlightCount,
        isHistoryLoading,
        isInviteCreationLoading,
        members,
        onSignOut,
        openCamera,
        pendingBatchId,
        pendingBatchItems,
        pendingBatchScanCount,
        pendingBatchAllocations,
        pendingBatchAvailableCards,
        isBatchApprovalConfirmOpen,
        selectedHistoryItem,
        teamPendingInvites,
        approveBatch,
        addBatchItem,
        createBatch,
        createInvite,
        openCamera,
        openBatchEditor,
        openHistory,
        openReassignSheet,
        promoteMember,
        reassignAssignment,
        removeBatchItem,
        queue,
        retry,
        updateAssignmentState,
        updateLeadDetails,
        displayActiveTeamName,
        isPersonalHistory,
        isTeamCreationLoading,
        visibleHistoryItems,
        session.user.email,
        team,
        workerMembers,
        canApprovePendingBatch,
        hasMoreHistory,
        loadMoreHistory,
        isLoadingMoreHistory
      ]
  );

  return (
    <View style={[styles.appContainer, { backgroundColor: theme.colors.background }]}>
      {pendingScanReview ? (
        <ParsedCardReviewScreen
          activeTeamName={displayActiveTeamName}
          isSaving={isSavingParsedReview}
          onAddBackSide={pendingScanReview.cachePaths.length === 1 ? addBackSideToPendingReview : null}
          review={pendingScanReview}
          onRetake={retakePendingScanReview}
          onSave={savePendingScanReview}
        />
      ) : isCameraOpen ? (
        <CameraScreen
          allowGallery={captureMode !== 'doubleSided'}
          afterSaveBehavior={afterSaveBehavior}
          captureProcessing={captureProcessing}
          cameraFacing={cameraFacing}
          captureMode={captureMode}
          captureHint={captureHint}
          captureTitle={captureTitle}
          handleCapture={handleCapture}
          handlePickFromGallery={handlePickFromGallery}
          handleTakePicture={handleTakePicture}
          hasPendingFrontSide={Boolean(pendingFrontSide)}
          inFlightCount={inFlightCount}
          isCapturing={isCapturing}
          onClose={closeCamera}
          onOpenQueue={() => queueSheetRef.current?.present()}
          onRotateCamera={() => setCameraFacing((current) => (current === 'back' ? 'front' : 'back'))}
          onToggleAfterSaveBehavior={toggleAfterSaveBehavior}
          onToggleCaptureMode={toggleCaptureMode}
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
          <MotionBottomNav
            activeKey={activeTab}
            bottomInset={insets.bottom}
            onChange={handleTabChange}
            onOpenCamera={openCamera}
            routes={visibleRoutes}
          />
        </>
      )}
      <QueueSheet items={queue} onRetry={retry} ref={queueSheetRef} />
      <TeamAssignmentBatchSheet
        ref={batchSheetRef}
        availableItems={pendingBatchAvailableCards}
        allocations={pendingBatchAllocations}
        batchItems={pendingBatchCards}
        batchScanCount={pendingBatchScanCount}
        isLoading={isBatchActionLoading}
        workers={workerMembers}
        onAddItem={(scannedLeadId) => {
          void addBatchItem(scannedLeadId).catch((error) => {
            console.warn('Batch item add failed', error);
          });
        }}
        onRemoveItem={(scannedLeadId) => {
          void removeBatchItem(scannedLeadId).catch((error) => {
            console.warn('Batch item remove failed', error);
          });
        }}
        onChangeAllocation={(userId, count) => {
          updatePendingBatchAllocation(userId, count);
        }}
      />
      <TeamReassignSheet
        assignmentItem={selectedReassignItem}
        isLoading={isAssignmentReassignmentLoading}
        members={members}
        ref={reassignSheetRef}
        onReassign={(scannedLeadId, targetUserId) => {
          void handleReassignSelection(scannedLeadId, targetUserId).catch((error) => {
            console.warn('Assignment reassignment failed', error);
          });
        }}
      />
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

function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <MaterialThemeProvider>
        <AppPreferencesProvider>
          <BottomSheetModalProvider>
            <StatusBar style="auto" />
            {children}
          </BottomSheetModalProvider>
        </AppPreferencesProvider>
      </MaterialThemeProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isScannerStoreReady, setIsScannerStoreReady] = useState(false);
  const handledOAuthCallbackUrls = useRef(new Set<string>());

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
      if (handledOAuthCallbackUrls.current.has(url)) {
        return;
      }

      const params = getOAuthCallbackParams(url);
      const authFlowToken = params.get('auth_flow');
      const authIntent = params.get('auth_intent');
      const errorDescription = params.get('error_description') ?? params.get('error');
      const code = params.get('code') ?? getOAuthCodeFromUrl(url);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!code && (!accessToken || !refreshToken) && !errorDescription) {
        return;
      }

      handledOAuthCallbackUrls.current.add(url);

      if (errorDescription) {
        console.warn('Supabase OAuth callback failed', errorDescription);
        return;
      }

      if (code) {
        const isAuthorizedRedirect = await consumeAuthRedirectFlow(
          authFlowToken,
          authIntent === 'oauth' ? 'oauth' : 'email'
        );
        if (!isAuthorizedRedirect) {
          console.warn('Ignored unexpected auth callback', { authIntent, url });
          return;
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) {
          return;
        }

        if (error) {
          console.warn('Supabase OAuth callback failed', error);
          return;
        }

        setSession(data.session ?? null);
        return;
      }

      if (!accessToken || !refreshToken) {
        return;
      }

      const tokenRedirectIntent: AuthRedirectIntent = authIntent === 'recovery' ? 'recovery' : 'oauth';
      const isAuthorizedTokenRedirect = await consumeAuthRedirectFlow(authFlowToken, tokenRedirectIntent);
      if (!isAuthorizedTokenRedirect) {
        console.warn('Ignored unexpected token auth callback', { authIntent, url });
        return;
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (cancelled) {
        return;
      }

      if (error) {
        console.warn('Supabase OAuth callback failed', error);
        return;
      }

      setSession(data.session ?? null);
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

  const teamWorkspace = useTeamWorkspace(session);
  const {
    isInviteDecisionSubmitting,
    isInviteGateReady,
    pendingInvite,
    respondToInvite
  } = teamWorkspace;

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

  useEffect(() => {
    if (!session?.user.id || !isScannerStoreReady) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const cloudHistory = await loadCloudPersonalHistory(session.user.id);
        if (!cancelled) {
          scannerQueueStore.getState().replaceHistory(cloudHistory);
        }
      } catch (error) {
        console.warn('Personal history refresh failed', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isScannerStoreReady, session?.user.id]);

  const handleSignOut = useCallback(() => {
    void supabase.auth.signOut().catch((error) => {
      console.warn('Supabase sign out failed', error);
    });
  }, []);

  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={styles.appContainer}>
        <AppProviders>
          {session === undefined || (session && (!isScannerStoreReady || !isInviteGateReady)) ? (
            <View style={styles.loadingScreen}>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingText} variant="titleMedium">
                Loading account
              </Text>
            </View>
          ) : !session ? (
            <AuthScreen />
          ) : pendingInvite ? (
            <View style={styles.loadingScreen}>
              <Surface style={styles.inviteGateCard}>
                <Text variant="headlineSmall">Team invite pending</Text>
                <Text style={styles.inviteGateBody} variant="bodyMedium">
                  Review this team invitation before using the scanner.
                </Text>
                <View style={styles.inviteGateDetails}>
                  <View style={styles.inviteGateDetailRow}>
                    <Text variant="labelMedium">Team</Text>
                    <Text style={styles.inviteGateDetailValue} variant="bodyMedium">
                      {pendingInvite.teamName ?? 'Unknown team'}
                    </Text>
                  </View>
                  <View style={styles.inviteGateDetailRow}>
                    <Text variant="labelMedium">Team leader</Text>
                    <Text style={styles.inviteGateDetailValue} variant="bodyMedium">
                      {pendingInvite.teamLeaderEmail ?? 'Unknown leader'}
                    </Text>
                  </View>
                  <View style={styles.inviteGateDetailRow}>
                    <Text variant="labelMedium">Invited email</Text>
                    <Text style={styles.inviteGateDetailValue} variant="bodyMedium">
                      {pendingInvite.invitedEmail}
                    </Text>
                  </View>
                </View>
                <View style={styles.inviteGateActions}>
                  <Button
                    disabled={isInviteDecisionSubmitting}
                    mode="outlined"
                    onPress={() => {
                      void respondToInvite('decline').catch((error) => {
                        console.warn('Team invite response failed', error);
                        Alert.alert('Invite update failed', 'Please try again.');
                      });
                    }}
                    testID="decline-team-invite-button"
                  >
                    Decline
                  </Button>
                  <Button
                    disabled={isInviteDecisionSubmitting}
                    loading={isInviteDecisionSubmitting}
                    mode="contained"
                    onPress={() => {
                      void respondToInvite('accept').catch((error) => {
                        console.warn('Team invite response failed', error);
                        Alert.alert('Invite update failed', 'Please try again.');
                      });
                    }}
                    testID="accept-team-invite-button"
                  >
                    Accept
                  </Button>
                </View>
              </Surface>
            </View>
          ) : (
            <ScannerApp onSignOut={handleSignOut} session={session} workspace={teamWorkspace} />
          )}
        </AppProviders>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1
  },
  errorMessage: {
    marginTop: 12
  },
  errorScreen: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  errorScreenContent: {
    maxWidth: 780,
    padding: 24,
    width: '100%'
  },
  errorStack: {
    marginTop: 16
  },
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  loadingText: {
    marginTop: 12
  },
  inviteGateActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 20
  },
  inviteGateBody: {
    marginTop: 12
  },
  inviteGateCard: {
    borderRadius: 8,
    maxWidth: 380,
    padding: 20,
    width: '92%'
  },
  inviteGateDetails: {
    gap: 10,
    marginTop: 16
  },
  inviteGateDetailRow: {
    borderColor: 'rgba(11, 35, 66, 0.12)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  inviteGateDetailValue: {
    fontWeight: '600'
  },
  batchActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  cameraContainer: {
    flex: 1
  },
  cameraBackdropTint: {
    ...StyleSheet.absoluteFillObject
  },
  cameraDimBottom: {
    flex: 1
  },
  cameraDimMiddle: {
    flexDirection: 'row',
    width: '100%'
  },
  cameraDimSide: {
    height: '100%'
  },
  cameraDimTop: {
    width: '100%'
  },
  captureProcessingCard: {
    alignItems: 'center',
    borderRadius: 22,
    gap: 10,
    maxWidth: 320,
    paddingHorizontal: 20,
    paddingVertical: 18,
    width: '100%'
  },
  captureProcessingOverlay: {
    alignItems: 'center',
    bottom: 136,
    justifyContent: 'center',
    left: 24,
    position: 'absolute',
    right: 24,
    top: 108,
    zIndex: 30
  },
  captureProcessingTitle: {
    textAlign: 'center'
  },
  cameraGuidance: {
    alignItems: 'center',
    bottom: 132,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    paddingHorizontal: 20,
    right: 0,
    top: 96
  },
  cameraGuideStage: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
    width: '100%'
  },
  cameraGuideCopy: {
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    maxWidth: 340,
    paddingHorizontal: 24
  },
  cameraGuideFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14
  },
  cameraGuideCornerBottomLeft: {
    borderBottomWidth: 4,
    borderColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderRadius: 2,
    height: 70,
    width: 70
  },
  cameraGuideCornerBottomRight: {
    borderBottomWidth: 4,
    borderColor: '#FFFFFF',
    borderRadius: 2,
    borderRightWidth: 4,
    height: 70,
    width: 70
  },
  cameraGuideCornerTopLeft: {
    borderColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderRadius: 2,
    borderTopWidth: 4,
    height: 70,
    width: 70
  },
  cameraGuideCornerTopRight: {
    borderColor: '#FFFFFF',
    borderRadius: 2,
    borderRightWidth: 4,
    borderTopWidth: 4,
    height: 70,
    width: 70
  },
  cameraGuideFrame: {
    justifyContent: 'space-between',
    position: 'relative',
    width: '100%'
  },
  cameraGuideRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  cameraGuideRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  cameraBottomTray: {
    alignItems: 'center',
    borderRadius: 24,
    bottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 12,
    minHeight: 76,
    paddingBottom: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
    position: 'absolute',
    right: 12,
    shadowColor: '#0B2342',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    zIndex: 20
  },
  cameraGuideSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 18,
    textAlign: 'center'
  },
  cameraGuideTitle: {
    color: '#FFFFFF',
    textAlign: 'center'
  },
  cameraModeBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  cameraPortraitOverlay: {
    alignItems: 'center',
    bottom: 112,
    justifyContent: 'center',
    left: 20,
    position: 'absolute',
    right: 20,
    top: 100
  },
  cameraRotateCard: {
    alignItems: 'center',
    borderRadius: 28,
    gap: 14,
    maxWidth: 360,
    paddingHorizontal: 24,
    paddingVertical: 28,
    width: '100%'
  },
  cameraRotateHintRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  cameraRotateIconWrap: {
    alignItems: 'center',
    borderRadius: 20,
    height: 58,
    justifyContent: 'center',
    width: 58
  },
  cameraSideLabelLeft: {
    color: '#FFFFFF',
    left: -18,
    position: 'absolute',
    top: '50%',
    transform: [{ rotate: '-90deg' }]
  },
  cameraSideLabelRight: {
    color: '#FFFFFF',
    position: 'absolute',
    right: -8,
    top: '50%',
    transform: [{ rotate: '90deg' }]
  },
  cameraTrayItem: {
    alignItems: 'center',
    borderRadius: 12,
    gap: 4,
    justifyContent: 'flex-end',
    minHeight: 54,
    minWidth: 58,
    paddingHorizontal: 6,
    paddingVertical: 5
  },
  cameraTrayItemDisabled: {
    opacity: 0.5
  },
  cameraTrayItemPressed: {
    backgroundColor: 'rgba(49, 93, 134, 0.10)'
  },
  cameraTrayModeItem: {
    minWidth: 66,
    paddingHorizontal: 8
  },
  cameraTrayBatchItem: {
    borderWidth: 0
  },
  cameraTraySection: {
    alignItems: 'flex-end',
    flex: 1,
    flexDirection: 'row',
    gap: 8
  },
  cameraTraySectionLeft: {
    justifyContent: 'flex-start'
  },
  cameraTraySectionRight: {
    gap: 2,
    justifyContent: 'flex-end'
  },
  cameraTrayCaptureSpacer: {
    flexShrink: 0,
    width: 108
  },
  cameraTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 20,
    position: 'absolute',
    right: 20,
    top: 48,
    zIndex: 5
  },
  emptyCard: {
    borderRadius: 8,
    marginTop: 20
  },
  emptyContent: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 56,
    justifyContent: 'center',
    width: 56
  },
  detailActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  detailHeroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  captureModeCopy: {
    flex: 1,
    gap: 4
  },
  captureModeIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  captureModeOption: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    padding: 14
  },
  captureModePanel: {
    borderRadius: 22,
    gap: 12,
    padding: 12
  },
  detailField: {
    borderBottomColor: 'rgba(127, 127, 127, 0.22)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingVertical: 10
  },
  detailHero: {
    borderRadius: 8,
    gap: 10,
    padding: 18
  },
  detailPanel: {
    borderRadius: 8,
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  emptyReviewDropZone: {
    alignItems: 'center',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  parsedReviewHero: {
    borderRadius: 24,
    gap: 16,
    overflow: 'hidden',
    padding: 18
  },
  parsedReviewHeroCopy: {
    gap: 6
  },
  parsedReviewHeroIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  parsedReviewHeroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  parsedReviewPanel: {
    borderRadius: 18,
    gap: 12,
    padding: 14,
    shadowColor: '#0B2342',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12
  },
  parsedReviewSectionHeader: {
    gap: 4,
    paddingHorizontal: 4,
    paddingTop: 2
  },
  parsedReviewStatPill: {
    borderRadius: 16,
    flex: 1,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  parsedReviewStats: {
    flexDirection: 'row',
    gap: 10
  },
  parsedReviewField: {
    borderRadius: 18,
    gap: 10,
    padding: 12
  },
  parsedReviewFieldHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  parsedReviewFieldTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 8
  },
  reviewBlockCountBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  reviewBlockActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6
  },
  reviewBlockChip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  reviewBlockList: {
    gap: 6,
    marginTop: 6
  },
  reviewBlockPressable: {
    gap: 8
  },
  reviewBlockSourceBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  reviewBlockTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  settingsGroup: {
    gap: 10
  },
  settingsOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  settingsSectionHeader: {
    gap: 4
  },
  selectedReviewBlockBanner: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  selectedReviewBlockCopy: {
    flex: 1,
    gap: 2
  },
  reviewBackButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  reviewContent: {
    gap: 10,
    paddingHorizontal: 6,
    paddingTop: 2
  },
  reviewFieldList: {
    gap: 8
  },
  reviewFooter: {
    alignItems: 'center',
    borderTopColor: 'rgba(11, 35, 66, 0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8
  },
  reviewFooterPrimaryButton: {
    borderRadius: 10,
    flex: 1,
    minHeight: 50
  },
  reviewFooterSecondaryButton: {
    borderRadius: 10,
    flex: 1,
    minHeight: 50
  },
  reviewHeaderCopy: {
    alignItems: 'center',
    flex: 1,
    gap: 2
  },
  reviewHeaderMeta: {
    alignItems: 'flex-end',
    minWidth: 34
  },
  reviewHeroRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16
  },
  reviewPreviewAction: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: 6,
    paddingVertical: 8,
    shadowColor: '#0B2342',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6
  },
  reviewPreviewActions: {
    flex: 1,
    gap: 6
  },
  reviewPreviewCard: {
    borderRadius: 10,
    flex: 1.7,
    overflow: 'hidden',
    shadowColor: '#0B2342',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10
  },
  reviewPreviewImage: {
    aspectRatio: 1.6,
    width: '100%'
  },
  reviewScreen: {
    flex: 1
  },
  reviewTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 2
  },
  historyAvatar: {
    alignItems: 'center',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    width: 52
  },
  historyHeroActions: {
    alignItems: 'flex-end',
    gap: 10
  },
  historyHeroBadge: {
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
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
    borderRadius: 8,
    flexDirection: 'row',
    gap: 16,
    padding: 18
  },
  historyHeroCopy: {
    flex: 1
  },
  historyMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4
  },
  historyList: {
    gap: 10
  },
  historyRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  historyRowCopy: {
    flex: 1
  },
  historyToolbar: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    padding: 12
  },
  queueRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  queueRowCopy: {
    flex: 1
  },
  queueStatsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%'
  },
  queueStatPill: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    flex: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  queueThumb: {
    borderRadius: 8,
    height: 52,
    width: 52
  },
  palettePanel: {
    borderRadius: 8,
    gap: 18,
    padding: 18
  },
  metricRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  metricRailItem: {
    borderRadius: 8,
    gap: 2,
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 94,
    paddingHorizontal: 14,
    paddingVertical: 16
  },
  profileAvatar: {
    alignItems: 'center',
    borderRadius: 999,
    height: 52,
    justifyContent: 'center',
    width: 52
  },
  profileHero: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 14,
    padding: 18
  },
  profileHeroCopy: {
    flex: 1
  },
  profileFieldActionButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  profileFieldActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingLeft: 4
  },
  profileFieldCard: {
    borderRadius: 8,
    gap: 2,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#0B2342',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6
  },
  profileFieldContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8
  },
  profileFieldCopy: {
    flex: 1,
    gap: 0
  },
  profileFieldIconWrap: {
    alignItems: 'center',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  profileFieldInput: {
    backgroundColor: 'transparent',
    fontSize: 15,
    fontWeight: '500',
    minHeight: 26,
    paddingHorizontal: 0,
    paddingVertical: 0
  },
  profileFieldInputWrap: {
    gap: 0,
    minHeight: 28,
    paddingVertical: 0
  },
  profileAccountInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  profileAccountPanel: {
    borderRadius: 8,
    gap: 16,
    padding: 18
  },
  teamList: {
    gap: 10
  },
  teamSection: {
    gap: 12
  },
  teamSectionHeader: {
    gap: 4
  },
  teamStatChip: {
    borderRadius: 8,
    flex: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  teamStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  teamSummaryHeader: {
    alignItems: 'flex-start',
    gap: 12
  },
  teamSummaryHeading: {
    gap: 4
  },
  teamSummaryPanel: {
    borderRadius: 8,
    gap: 18,
    padding: 18
  },
  teamPanel: {
    borderRadius: 8,
    gap: 16,
    padding: 18
  },
  teamCreateStack: {
    gap: 10
  },
  assignmentActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  managementPanel: {
    borderRadius: 8,
    gap: 10,
    padding: 14
  },
  allocationPreviewPanel: {
    borderRadius: 8,
    gap: 12,
    padding: 14
  },
  memberList: {
    gap: 10
  },
  memberRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14
  },
  memberActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8
  },
  memberListScroll: {
    height: 320
  },
  memberRowCopy: {
    flex: 1,
    gap: 2
  },
  teamRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14
  },
  teamRowCopy: {
    flex: 1,
    gap: 2
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
  pageHeader: {
    borderColor: 'rgba(127, 127, 127, 0.22)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18
  },
  pageHeaderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 18
  },
  pageHeaderCopy: {
    flex: 1
  },
  pageHeaderTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  recentList: {
    gap: 10
  },
  screen: {
    flex: 1
  },
  screenContent: {
    gap: 16,
    padding: 20,
    paddingBottom: 96
  },
  screenKicker: {
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase'
  },
  sectionCard: {
    borderRadius: 8,
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
});
