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
  TextInput,
  Text
} from 'react-native-paper';
import type { Session } from '@supabase/supabase-js';

import { AuthScreen } from './src/components/AuthScreen';
import { BlurryImageError, extractText } from './lib/ocr';
import { type TeamInboxItem } from './src/lib/teamInbox';
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
import { AnimatedStatCard } from './src/components/AnimatedStatCard';
import { TeamAssignmentBatchSheet } from './src/components/TeamAssignmentBatchSheet';
import { TeamReassignSheet } from './src/components/TeamReassignSheet';
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

type AppTab = 'dashboard' | 'history' | 'team' | 'profile';
type HistoryFilter = 'all' | 'saved' | 'needs-review' | 'unassigned' | 'assigned' | 'done';
type HistoryMode = 'leader-inbox' | 'worker-history';

type PendingScanReview = {
  cachePath: string;
  leadId: string;
  rawText: string;
  teamId: string | null;
};

function getTeamInboxItemTitle(item: TeamInboxItem): string {
  return item.fullName ?? item.companyName ?? item.rawText.split('\n')[0] ?? 'Untitled scan';
}

function getTeamInboxItemSubtitle(item: TeamInboxItem): string {
  return item.companyName ?? item.jobTitle ?? item.email ?? item.id;
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
  { focusedIcon: 'account-circle', key: 'profile', title: 'Profile', unfocusedIcon: 'account-circle-outline' }
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
  activeTeamName,
  history,
  inFlightCount,
  failedCount,
  onOpenCamera,
  onOpenHistory,
  status
}: {
  activeTeamName: string | null;
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
          activeTeamName={activeTeamName}
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
            New captures stay in the Team Inbox until a Team Leader assigns them.
          </Text>
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Card mode="outlined" style={styles.sectionCard}>
          <Card.Title subtitle="Unassigned scans are ready for review." title="Latest saves" />
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

function HistoryScreen({
  canApproveBatch,
  canCreateBatch,
  canEditBatch,
  members,
  teamName,
  isBatchActionLoading,
  isLoading,
  items,
  mode,
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
  items: TeamInboxItem[];
  mode: HistoryMode;
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
  const title = mode === 'leader-inbox' ? 'Team Inbox' : 'Assignments';
  const subtitle = mode === 'leader-inbox'
    ? 'Review unassigned scans, edit the pending Batch Assignment, or reassign work.'
    : 'Only scans assigned to your account appear here.';
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

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Surface
          elevation={2}
          style={[styles.historyHero, { backgroundColor: theme.colors.surfaceContainerHigh }]}
        >
          <View style={styles.historyHeroCopy}>
            <Text style={styles.screenKicker} variant="labelSmall">
              {mode === 'leader-inbox' ? 'Team Leader' : 'Worker'}
            </Text>
            <Text variant="headlineMedium">{title}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} variant="bodyMedium">
              {subtitle}
            </Text>
            {teamName ? (
              <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }} variant="labelLarge">
                {teamName}
              </Text>
            ) : null}
          </View>
          <Button icon="camera" mode="contained" onPress={onOpenCamera} testID="history-empty-scan-button">
            Scan card
          </Button>
        </Surface>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(110).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
        <MetricRail
          items={
            mode === 'leader-inbox'
              ? [
                  { label: 'Cards', tone: 'default', value: items.length },
                  { label: 'Open', tone: 'tertiary', value: unassignedCount },
                  { label: 'Assigned', tone: 'secondary', value: assignedCount }
                ]
              : [
                  { label: 'Cards', tone: 'default', value: items.length },
                  { label: 'Ready', tone: 'tertiary', value: parsedCount },
                  { label: 'Review', tone: 'secondary', value: items.length - parsedCount }
                ]
          }
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
                Create batch
              </Button>
              <Button
                disabled={!canEditBatch || isBatchActionLoading}
                mode="outlined"
                onPress={onEditBatch}
                testID="edit-assignment-batch-button"
              >
                Edit batch
              </Button>
              <Button
                disabled={!canApproveBatch || isBatchActionLoading}
                mode="contained"
                onPress={onApproveBatch}
                testID="approve-assignment-batch-button"
              >
                Approve batch
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
              Loading {mode === 'leader-inbox' ? 'team inbox' : 'history'}...
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
                    : 'Assigned scans will appear here after your team leader approves a batch.'
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
              layout={LinearTransition.springify().damping(24).stiffness(300)}
            >
              <Pressable accessibilityRole="button" onPress={() => onOpenItem(item)} testID={`open-history-item-${item.id}`}>
              <Surface elevation={1} style={[styles.historyRow, { backgroundColor: theme.colors.surfaceContainer }]}>
                <View style={styles.historyRowCopy}>
                  <Text numberOfLines={1} variant="titleMedium">
                    {getTeamInboxItemTitle(item)}
                  </Text>
                  <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
                    {getTeamInboxItemSubtitle(item)}
                  </Text>
                  {mode === 'leader-inbox' ? (
                    <>
                      <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} variant="labelSmall">
                        {item.assignmentState
                          ? `Assignment: ${item.assignmentState === 'done' ? 'Done' : item.assignmentState === 'needs_review' ? 'Needs review' : 'Assigned'}`
                          : 'Unassigned · Team Inbox'}
                      </Text>
                      <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} variant="labelSmall">
                        {item.assignmentState && item.assignedToUserId
                          ? `Assigned to ${memberLabelById.get(item.assignedToUserId) ?? item.assignedToUserId}`
                          : `Captured by ${item.capturedByUserId}`}
                      </Text>
                    </>
                  ) : item.assignmentState ? (
                    <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} variant="labelSmall">
                      Assignment: {item.assignmentState === 'done' ? 'Done' : item.assignmentState === 'needs_review' ? 'Needs review' : 'Assigned'}
                    </Text>
                  ) : null}
                  {mode === 'leader-inbox' && item.assignmentState ? (
                    <View style={styles.assignmentActions}>
                      <Button
                        compact
                        mode="outlined"
                        onPress={() => onOpenReassignAssignment(item)}
                      >
                        Reassign
                      </Button>
                    </View>
                  ) : null}
                  {mode === 'worker-history' && item.assignmentState ? (
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
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

function AssignmentDetailScreen({
  item,
  memberLabel,
  mode,
  onBack,
  onOpenReassignAssignment,
  onUpdateAssignmentState
}: {
  item: TeamInboxItem;
  memberLabel: string | null;
  mode: HistoryMode;
  onBack: () => void;
  onOpenReassignAssignment: (item: TeamInboxItem) => void;
  onUpdateAssignmentState: (scannedLeadId: string, assignmentState: 'done' | 'needs_review') => Promise<void>;
}) {
  const theme = useAppTheme();
  const [confirmNeedsReview, setConfirmNeedsReview] = useState(false);

  if (confirmNeedsReview) {
    return (
      <ScreenShell>
        <Surface elevation={2} style={[styles.detailHero, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
          <Text style={styles.screenKicker} variant="labelSmall">
            Assignment State
          </Text>
          <Text variant="headlineSmall">Mark as needs review?</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
            Use this when contact details are incomplete or a Team Leader needs to help.
          </Text>
        </Surface>
        <Surface elevation={1} style={[styles.detailPanel, { backgroundColor: theme.colors.surfaceContainer }]}>
          <DetailField label="Assignment" value={getTeamInboxItemTitle(item)} />
          <DetailField label="Worker" value={memberLabel ?? item.assignedToUserId ?? 'Current Worker'} />
          <DetailField label="Team" value={item.teamId ?? 'Active Team'} />
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
      <Surface elevation={2} style={[styles.detailHero, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
        <Button compact icon="arrow-left" mode="text" onPress={onBack}>
          Back
        </Button>
        <Text style={styles.screenKicker} variant="labelSmall">
          {item.assignmentState ? 'Assignment' : 'Unassigned scan'}
        </Text>
        <Text variant="headlineSmall">{getTeamInboxItemTitle(item)}</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
          {getTeamInboxItemSubtitle(item)}
        </Text>
      </Surface>

      <Surface elevation={1} style={[styles.detailPanel, { backgroundColor: theme.colors.surfaceContainer }]}>
        <DetailField label="Name" value={item.fullName ?? 'Not found'} />
        <DetailField label="Role" value={item.jobTitle ?? 'Not found'} />
        <DetailField label="Company" value={item.companyName ?? 'Not found'} />
        <DetailField label="Email" value={item.email ?? 'Not found'} />
        <DetailField label="Phone" value={item.phoneNumber ?? 'Not found'} />
      </Surface>

      <Surface elevation={1} style={[styles.detailPanel, { backgroundColor: theme.colors.surfaceContainer }]}>
        <DetailField label="Assignment State" value={item.assignmentState ? item.assignmentState.replace('_', ' ') : 'Team Inbox'} />
        <DetailField label="Captured By" value={item.capturedByUserId} />
        <DetailField label="Visible To" value={item.assignmentState ? memberLabel ?? item.assignedToUserId ?? 'Worker' : 'Team Leaders'} />
      </Surface>

      <View style={styles.detailActions}>
        {mode === 'worker-history' && item.assignmentState ? (
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
        {mode === 'leader-inbox' && item.assignmentState ? (
          <Button mode="contained" onPress={() => onOpenReassignAssignment(item)}>
            Reassign Assignment
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

function TeamCaptureConfirmScreen({
  activeTeamName,
  onConfirm,
  onSwitchTeam
}: {
  activeTeamName: string;
  onConfirm: () => void;
  onSwitchTeam: () => void;
}) {
  const theme = useAppTheme();

  return (
    <ScreenShell>
      <Surface elevation={2} style={[styles.detailHero, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
        <Text style={styles.screenKicker} variant="labelSmall">
          First scan after switching Team
        </Text>
        <Text variant="headlineSmall">Save this card to {activeTeamName}?</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
          Confirming prevents cards from being saved to the wrong Team.
        </Text>
      </Surface>
      <View style={styles.detailActions}>
        <Button mode="contained" onPress={onConfirm} testID="confirm-team-capture-button">
          Confirm Team and capture
        </Button>
        <Button mode="outlined" onPress={onSwitchTeam}>
          Switch Team
        </Button>
      </View>
    </ScreenShell>
  );
}

function BatchApprovalConfirmScreen({
  scanCount,
  workerCount,
  onApprove,
  onBack
}: {
  scanCount: number;
  workerCount: number;
  onApprove: () => void;
  onBack: () => void;
}) {
  const theme = useAppTheme();

  return (
    <ScreenShell>
      <Surface elevation={2} style={[styles.detailHero, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
        <Text style={styles.screenKicker} variant="labelSmall">
          Final approval
        </Text>
        <Text variant="headlineSmall">Create {scanCount} Assignments?</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
          Workers will only see scans placed into their Assignments. Team Leaders keep full visibility.
        </Text>
      </Surface>
      <MetricRail
        items={[
          { label: 'Scans', value: scanCount },
          { label: 'Workers', tone: 'tertiary', value: workerCount },
          { label: 'State', tone: 'secondary', value: scanCount > 0 ? 1 : 0 }
        ]}
      />
      <View style={styles.detailActions}>
        <Button mode="contained" onPress={onApprove} testID="confirm-approve-assignment-batch-button">
          Approve Batch Assignment
        </Button>
        <Button mode="outlined" onPress={onBack}>
          Keep editing
        </Button>
      </View>
    </ScreenShell>
  );
}

function OcrReviewScreen({
  activeTeamName,
  review,
  onRetake,
  onSave
}: {
  activeTeamName: string | null;
  review: PendingScanReview;
  onRetake: () => void;
  onSave: () => void;
}) {
  const theme = useAppTheme();
  const previewLines = review.rawText.split('\n').map((line) => line.trim()).filter(Boolean);

  return (
    <ScreenShell>
      <Surface elevation={2} style={[styles.detailHero, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
        <Text style={styles.screenKicker} variant="labelSmall">
          {activeTeamName ?? 'Active Team'}
        </Text>
        <Text variant="headlineSmall">Review scan</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
          Check the on-device OCR before saving this card to the Team Inbox.
        </Text>
      </Surface>

      <Surface elevation={1} style={[styles.detailPanel, { backgroundColor: theme.colors.surfaceContainer }]}>
        <DetailField label="Name candidate" value={previewLines[0] ?? 'Not found'} />
        <DetailField label="Company candidate" value={previewLines[1] ?? 'Not found'} />
        <DetailField label="Raw OCR" value={review.rawText} />
      </Surface>

      <View style={styles.detailActions}>
        <Button mode="contained" onPress={onSave} testID="save-ocr-review-button">
          Save to Team Inbox
        </Button>
        <Button mode="outlined" onPress={onRetake}>
          Retake
        </Button>
      </View>
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

function TeamScreen({
  activeTeamId,
  activeTeamName,
  teams,
  isTeamCreationLoading,
  isTeamMembersLoading,
  isTeamsLoading,
  isInviteCreationLoading,
  currentUserId,
  members,
  teamPendingInvites,
  onCreateInvite,
  onPromoteMember,
  onCreateTeam,
  onSelectTeam
}: {
  activeTeamId: string | null;
  activeTeamName: string | null;
  teams: AccessibleTeam[];
  isTeamCreationLoading: boolean;
  isTeamMembersLoading: boolean;
  isTeamsLoading: boolean;
  isInviteCreationLoading: boolean;
  currentUserId: string;
  members: TeamMember[];
  teamPendingInvites: TeamWorkspaceState['teamPendingInvites'];
  onCreateTeam: (teamName: string) => Promise<void>;
  onCreateInvite: (invitedEmail: string) => Promise<void>;
  onPromoteMember: (userId: string) => Promise<void>;
  onSelectTeam: (teamId: string) => void;
}) {
  const theme = useAppTheme();
  const [teamName, setTeamName] = useState('');
  const [teamError, setTeamError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

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

  const hasActiveTeam = Boolean(activeTeamId);
  const canSwitchTeams = teams.length > 1;
  const leaderCount = members.filter((member) => member.isLeader).length;

  return (
    <ScreenShell>
      <Animated.View entering={FadeInUp.duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
        <Surface
          elevation={2}
          style={[styles.profileHero, { backgroundColor: theme.colors.surfaceContainerHigh }]}
        >
          <View style={[styles.profileAvatar, { backgroundColor: theme.colors.tertiaryContainer }]}>
            <List.Icon color={theme.colors.onTertiaryContainer} icon="account-group" />
          </View>
          <View style={styles.profileHeroCopy}>
            <Text style={styles.screenKicker} variant="labelSmall">
              Memberships
            </Text>
            <Text variant="headlineMedium">Team</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
              Manage the active Team, Workers, Team Leaders, and pending invites.
            </Text>
          </View>
          <View style={styles.profileStatusWrap}>
            <StatusChip status={hasActiveTeam ? 'parsed' : 'idle'} />
          </View>
        </Surface>
      </Animated.View>

      {hasActiveTeam ? (
        <Animated.View entering={FadeInDown.delay(110).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
          <View style={styles.teamStatsRow}>
            <AnimatedStatCard delay={0} label="Teams" value={teams.length} />
            <AnimatedStatCard delay={60} label="Members" value={members.length} />
            <AnimatedStatCard delay={120} label="Pending" value={teamPendingInvites.length} />
          </View>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(hasActiveTeam ? 170 : 140).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
        <Surface
          elevation={1}
          style={[styles.managementPanel, { backgroundColor: theme.colors.surfaceContainer }]}
        >
          <View style={styles.teamSectionHeader}>
            <Text variant="titleMedium">{hasActiveTeam ? 'Create another Team' : 'Create your first Team'}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
              {hasActiveTeam
                ? 'Add a new workspace if you need a separate group.'
                : 'Create a team before you can invite members or manage a current team.'}
            </Text>
          </View>
          <TextInput
            label="Team name"
            mode="outlined"
            onChangeText={(value) => {
              setTeamName(value);
              setTeamError(null);
            }}
            placeholder="North Hall"
            testID="team-name-input"
            value={teamName}
          />
          <Button
            disabled={isTeamCreationLoading}
            loading={isTeamCreationLoading}
            mode="contained"
            onPress={handleCreateTeam}
            testID="create-team-button"
          >
            Create team
          </Button>
          {teamError ? (
            <Text style={{ color: theme.colors.error }} variant="bodySmall">
              {teamError}
            </Text>
          ) : null}
        </Surface>
      </Animated.View>

      {hasActiveTeam ? (
        <>
          <Animated.View entering={FadeInDown.delay(hasActiveTeam ? 200 : 170).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
            <Surface
              elevation={1}
              style={[styles.teamSummaryPanel, { backgroundColor: theme.colors.surfaceContainer }]}
            >
              <View style={styles.teamSectionHeader}>
              <Text variant="titleMedium">Active Team</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                  {activeTeamName
                    ? `Active team: ${activeTeamName}`
                    : 'This is the team that will receive the next scan.'}
                </Text>
              </View>
              <Button compact mode="contained-tonal" disabled={!activeTeamId}>
                {activeTeamId ? 'Active' : 'No team'}
              </Button>
            </Surface>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(hasActiveTeam ? 230 : 200).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
            <Surface
              elevation={1}
              style={[styles.managementPanel, { backgroundColor: theme.colors.surfaceContainer }]}
            >
              <View style={styles.teamSectionHeader}>
              <Text variant="titleMedium">Pending Invite</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                  Send access to someone who should join this team.
                </Text>
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
                disabled={isInviteCreationLoading || !activeTeamId}
                loading={isInviteCreationLoading}
                mode="contained"
                onPress={handleCreateInvite}
                testID="create-invite-button"
              >
                Send Invite
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
                  <Text variant="titleSmall">Pending Invites</Text>
                  {teamPendingInvites.map((invite) => (
                    <Surface
                      key={invite.id}
                      elevation={0}
                      style={[styles.memberRow, { backgroundColor: theme.colors.surfaceContainerHighest }]}
                    >
                      <View style={styles.memberRowCopy}>
                        <Text variant="titleSmall">{invite.invitedEmail}</Text>
                        <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                          Worker invite
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

          <Animated.View entering={FadeInDown.delay(hasActiveTeam ? 260 : 230).duration(motion.duration.medium2).easing(motion.easing.emphasized)}>
            <Surface
              elevation={1}
              style={[styles.managementPanel, { backgroundColor: theme.colors.surfaceContainer }]}
            >
              <View style={styles.teamSectionHeader}>
                <Text variant="titleMedium">Members</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                  Promote members to team leaders and track who has access.
                </Text>
              </View>
              {isTeamMembersLoading ? (
                <ActivityIndicator />
              ) : members.length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
                  No members found.
                </Text>
              ) : (
                <View style={styles.memberList}>
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
                            {member.isLeader ? ' · Team leader' : ''}
                          </Text>
                        </View>
                        {member.isLeader ? (
                          <Button compact mode="outlined" disabled>
                            Leader
                          </Button>
                        ) : (
                          <Button
                            compact
                            mode="text"
                            onPress={() => {
                              void onPromoteMember(member.userId).catch((error) => {
                                setMemberError(error instanceof Error ? error.message : 'Promotion failed');
                              });
                            }}
                          >
                            Promote
                          </Button>
                        )}
                      </Surface>
                    );
                  })}
                </View>
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

      {canSwitchTeams ? (
        <Animated.View entering={FadeInDown.delay(hasActiveTeam ? 290 : 260).duration(motion.duration.medium1).easing(motion.easing.emphasized)}>
          <Surface
            elevation={1}
            style={[styles.managementPanel, { backgroundColor: theme.colors.surfaceContainer }]}
          >
            <View style={styles.teamSectionHeader}>
              <Text variant="titleMedium">Switch Team</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                Tap a team to make it active.
              </Text>
            </View>
            <View style={styles.teamList}>
              {teams.map((team) => {
                const active = team.id === activeTeamId;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    key={team.id}
                    onPress={() => onSelectTeam(team.id)}
                  >
                    <Surface
                      elevation={active ? 1 : 0}
                      style={[
                        styles.teamRow,
                        {
                          backgroundColor: active
                            ? theme.colors.secondaryContainer
                            : theme.colors.surfaceContainerHighest
                        }
                      ]}
                    >
                      <View style={styles.teamRowCopy}>
                        <Text
                          style={{
                            color: active ? theme.colors.onSecondaryContainer : theme.colors.onSurface
                          }}
                          variant="titleSmall"
                        >
                          {team.name}
                        </Text>
                        <Text
                          style={{
                            color: active ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant
                          }}
                          variant="bodySmall"
                        >
                          {team.createdBy === currentUserId ? 'Created by you' : 'Accessible team'}
                        </Text>
                      </View>
                      <Button
                        compact
                        disabled={active}
                        mode={active ? 'contained' : 'text'}
                        onPress={() => onSelectTeam(team.id)}
                      >
                        {active ? 'Active' : 'Make active'}
                      </Button>
                    </Surface>
                  </Pressable>
                );
              })}
            </View>
          </Surface>
        </Animated.View>
      ) : null}
    </ScreenShell>
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
          <Text style={styles.screenKicker} variant="labelSmall">
            Account
          </Text>
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
  workspace,
  session
}: {
  onSignOut: () => void;
  workspace: TeamWorkspaceState;
  session: Session;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [previousTabIndex, setPreviousTabIndex] = useState(0);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isTeamCaptureConfirmOpen, setIsTeamCaptureConfirmOpen] = useState(false);
  const [isBatchApprovalConfirmOpen, setIsBatchApprovalConfirmOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [selectedReassignItem, setSelectedReassignItem] = useState<TeamInboxItem | null>(null);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<TeamInboxItem | null>(null);
  const [pendingScanReview, setPendingScanReview] = useState<PendingScanReview | null>(null);
  const [pendingCaptureConfirmationTeamId, setPendingCaptureConfirmationTeamId] = useState<string | null>(null);
  const {
    activeTeamId,
    activeTeamName,
    teams,
    addBatchItem,
    createTeam,
    approveBatch,
    createBatch,
    createInvite,
    historyActiveTeamId,
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
    teamPendingInvites,
    members,
    promoteMember,
    reassignAssignment,
    removeBatchItem,
    updateAssignmentState,
    selectTeam
  } = workspace;
  const captureLockRef = useRef(false);
  const queueSheetRef = useRef<BottomSheetModal>(null);
  const batchSheetRef = useRef<BottomSheetModal>(null);
  const reassignSheetRef = useRef<BottomSheetModal>(null);
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
        setPendingScanReview({
          cachePath,
          leadId,
          rawText,
          teamId: activeTeamId
        });
        setIsCameraOpen(false);
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
  }, [activeTeamId, enqueue]);

  const savePendingScanReview = useCallback(() => {
    if (!pendingScanReview) {
      return;
    }

    enqueue({
      id: pendingScanReview.leadId,
      imagePath: pendingScanReview.cachePath,
      rawText: pendingScanReview.rawText,
      teamId: pendingScanReview.teamId
    });
    setPendingScanReview(null);
  }, [enqueue, pendingScanReview]);

  const retakePendingScanReview = useCallback(() => {
    setPendingScanReview(null);
    setIsCameraOpen(true);
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

  const openHistory = useCallback(() => {
    setIsCameraOpen(false);
    setPreviousTabIndex(activeIndex >= 0 ? activeIndex : 0);
    setActiveTab('history');
  }, [activeIndex]);

  const openCamera = useCallback(() => {
    if (activeTeamId && pendingCaptureConfirmationTeamId === activeTeamId && activeTeamName) {
      setIsTeamCaptureConfirmOpen(true);
      return;
    }

    setIsCameraOpen(true);
  }, [activeTeamId, activeTeamName, pendingCaptureConfirmationTeamId]);

  const confirmTeamAndOpenCamera = useCallback(() => {
    setPendingCaptureConfirmationTeamId(null);
    setIsTeamCaptureConfirmOpen(false);
    setIsCameraOpen(true);
  }, []);

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
  const pendingBatchCards = historyItems.filter((item) => pendingBatchItemSet.has(item.id));
  const pendingBatchAvailableCards = historyItems.filter(
    (item) => !pendingBatchItemSet.has(item.id) && !item.assignmentState
  );

  const handleSelectTeam = useCallback((teamId: string) => {
    selectTeam(teamId);
    setPendingCaptureConfirmationTeamId(teamId);
  }, [selectTeam]);

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
                scanCount={pendingBatchScanCount}
                workerCount={members.filter((member) => !member.isLeader).length}
                onApprove={() => {
                  setIsBatchApprovalConfirmOpen(false);
                  approveBatch();
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
                memberLabel={memberLabel}
                mode={historyMode}
                onBack={() => setSelectedHistoryItem(null)}
                onOpenReassignAssignment={openReassignSheet}
                onUpdateAssignmentState={updateAssignmentState}
              />
            );
          }

          return (
            <HistoryScreen
              canApproveBatch={Boolean(pendingBatchId && pendingBatchScanCount > 0)}
              canCreateBatch={Boolean(historyActiveTeamId && !pendingBatchId && pendingBatchAvailableCards.length > 0)}
              canEditBatch={Boolean(pendingBatchId)}
              members={members}
              teamName={historyTeamName}
              isBatchActionLoading={isBatchActionLoading}
              isLoading={isHistoryLoading}
              items={historyItems}
              mode={historyMode}
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
          return (
            <TeamScreen
              activeTeamId={activeTeamId}
              activeTeamName={activeTeamName}
              teams={teams}
              isTeamCreationLoading={isTeamCreationLoading}
              isTeamMembersLoading={isTeamMembersLoading}
              currentUserId={session.user.id}
              isInviteCreationLoading={isInviteCreationLoading}
              members={members}
              teamPendingInvites={teamPendingInvites}
              onCreateInvite={createInvite}
              isTeamsLoading={isTeamsLoading}
              onCreateTeam={createTeam}
              onPromoteMember={promoteMember}
              onSelectTeam={handleSelectTeam}
            />
          );
        case 'profile':
          return (
            <ProfileScreen
              onSignOut={onSignOut}
              userEmail={session.user.email}
            />
          );
        case 'dashboard':
        default:
          return (
            <DashboardScreen
              activeTeamName={activeTeamName}
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
      [
        dashboardStatus,
        failedCount,
        history,
        activeTeamId,
        teams,
        historyActiveTeamId,
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
        pendingBatchId,
        pendingBatchItems,
        pendingBatchScanCount,
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
        updateAssignmentState,
        handleSelectTeam,
        activeTeamName,
        session.user.email
      ]
  );

  return (
    <View style={[styles.appContainer, { backgroundColor: theme.colors.background }]}>
      {pendingScanReview ? (
        <OcrReviewScreen
          activeTeamName={activeTeamName}
          review={pendingScanReview}
          onRetake={retakePendingScanReview}
          onSave={savePendingScanReview}
        />
      ) : isTeamCaptureConfirmOpen && activeTeamName ? (
        <TeamCaptureConfirmScreen
          activeTeamName={activeTeamName}
          onConfirm={confirmTeamAndOpenCamera}
          onSwitchTeam={() => {
            setIsTeamCaptureConfirmOpen(false);
            setPreviousTabIndex(activeIndex >= 0 ? activeIndex : 0);
            setActiveTab('team');
          }}
        />
      ) : isCameraOpen ? (
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
      <TeamAssignmentBatchSheet
        ref={batchSheetRef}
        availableItems={pendingBatchAvailableCards}
        batchItems={pendingBatchCards}
        batchScanCount={pendingBatchScanCount}
        isLoading={isBatchActionLoading}
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

  const handleSignOut = useCallback(() => {
    void supabase.auth.signOut().catch((error) => {
      console.warn('Supabase sign out failed', error);
    });
  }, []);

  if (session === undefined || (session && (!isScannerStoreReady || !isInviteGateReady))) {
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

  if (pendingInvite) {
    return (
      <GestureHandlerRootView style={styles.appContainer}>
        <SafeAreaProvider>
          <MaterialThemeProvider>
            <BottomSheetModalProvider>
              <StatusBar style="auto" />
              <View style={styles.loadingScreen}>
                <Surface style={styles.inviteGateCard}>
                  <Text variant="headlineSmall">Team invite pending</Text>
                  <Text style={styles.inviteGateBody} variant="bodyMedium">
                    {`Respond to the invite for ${pendingInvite.teamName ?? 'this team'} before using the scanner.`}
                  </Text>
                  <Text style={styles.inviteGateBody} variant="bodySmall">
                    {pendingInvite.invitedEmail}
                  </Text>
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
            <ScannerApp onSignOut={handleSignOut} session={session} workspace={teamWorkspace} />
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
  batchActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
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
  palettePanel: {
    borderRadius: 8,
    gap: 18,
    padding: 18
  },
  metricRail: {
    borderRadius: 8,
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
