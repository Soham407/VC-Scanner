import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Text, View } from 'react-native';

import App from '../App';
import { BlurryImageError } from '../lib/ocr';

const mockUseCameraPermissions = jest.fn();
const mockTakePictureAsync = jest.fn();
const mockExtractText = jest.fn();
const mockPrepareImage = jest.fn();
const mockEnqueue = jest.fn();
const mockRetry = jest.fn();
const mockDrainOnce = jest.fn();
const mockGarbageCollect = jest.fn();
const mockGetActiveTeamId = jest.fn();
const mockSetActiveTeamId = jest.fn();
const mockLoadAccessibleTeams = jest.fn();
const mockCreateTeam = jest.fn();
const mockCreateTeamInvite = jest.fn();
const mockListPendingTeamInvitesForEmail = jest.fn();
const mockListPendingTeamInvitesForTeam = jest.fn();
const mockRespondToTeamInvite = jest.fn();
const mockCreateTeamAssignmentBatch = jest.fn();
const mockApproveTeamAssignmentBatch = jest.fn();
const mockLoadPendingTeamAssignmentBatch = jest.fn();
const mockAddTeamAssignmentBatchItem = jest.fn();
const mockRemoveTeamAssignmentBatchItem = jest.fn();
const mockUpdateTeamAssignmentState = jest.fn();
const mockReassignTeamAssignment = jest.fn();
const mockLoadTeamMembers = jest.fn();
const mockPromoteTeamMemberToLeader = jest.fn();
const mockBottomSheetPresent = jest.fn();
const mockClearSystemNotice = jest.fn();
const mockUseNetInfo = jest.fn();
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockSyncScannerQueueStoreNamespace = jest.fn().mockResolvedValue(undefined);
const mockLoadTeamInboxReview = jest.fn();

const mockSession = {
  user: {
    email: 'user@example.com',
    id: 'user-1'
  }
};

let mockQueue: Array<{ id: string; status: 'uploading' | 'parsing' | 'failed'; imagePath: string; rawText: string; retryCount: number; error?: string }> = [];
let mockHistory: Array<{ id: string; imagePath: string; storagePath: string; rawText: string; parseStatus: 'parsed' | 'unparsed'; parsed: { fullName: string | null; jobTitle: string | null; companyName: string | null; email: string | null; phoneNumber: string | null }; savedAt: number }> = [];
let mockSystemNotice: null | { kind: 'success' | 'error'; title: string; message: string; createdAt: number } = null;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn()
}));

jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => mockUseNetInfo()
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const insets = {
    bottom: 0,
    left: 0,
    right: 0,
    top: 0
  };
  const frame = {
    height: 844,
    width: 390,
    x: 0,
    y: 0
  };

  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: unknown }) => <View style={style}>{children}</View>,
    SafeAreaFrameContext: React.createContext(frame),
    SafeAreaInsetsContext: React.createContext(insets),
    useSafeAreaInsets: () => insets
  };
});

jest.mock('../src/components/DevImageUploadSurface', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  return {
    DevImageUploadSurface: () => (
      <View>
        <Text>Pick image</Text>
        <Text>Prepare</Text>
        <Text>Upload</Text>
      </View>
    )
  };
});
jest.mock('../src/lib/imagePrep', () => ({
  prepareImage: (...args: unknown[]) => mockPrepareImage(...args)
}));

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args)
    }
  }
}));

jest.mock('../src/components/AuthScreen', () => ({
  AuthScreen: () => {
    const React = require('react');
    const { Text, View } = require('react-native');

    return (
      <View>
        <Text>Auth screen</Text>
      </View>
    );
  }
}));

jest.mock('../src/lib/teamContext', () => ({
  getActiveTeamId: (...args: unknown[]) => mockGetActiveTeamId(...args),
  setActiveTeamId: (...args: unknown[]) => mockSetActiveTeamId(...args)
}));

jest.mock('../src/lib/teams', () => ({
  createTeam: (...args: unknown[]) => mockCreateTeam(...args),
  loadAccessibleTeams: (...args: unknown[]) => mockLoadAccessibleTeams(...args)
}));

jest.mock('../src/lib/teamInbox', () => ({
  loadTeamInboxReview: (...args: unknown[]) => mockLoadTeamInboxReview(...args)
}));

jest.mock('../src/lib/teamInvites', () => ({
  createTeamInvite: (...args: unknown[]) => mockCreateTeamInvite(...args),
  listPendingTeamInvitesForEmail: (...args: unknown[]) => mockListPendingTeamInvitesForEmail(...args),
  listPendingTeamInvitesForTeam: (...args: unknown[]) => mockListPendingTeamInvitesForTeam(...args),
  respondToTeamInvite: (...args: unknown[]) => mockRespondToTeamInvite(...args)
}));
jest.mock('../src/lib/teamAssignments', () => ({
  addTeamAssignmentBatchItem: (...args: unknown[]) => mockAddTeamAssignmentBatchItem(...args),
  createTeamAssignmentBatch: (...args: unknown[]) => mockCreateTeamAssignmentBatch(...args),
  approveTeamAssignmentBatch: (...args: unknown[]) => mockApproveTeamAssignmentBatch(...args),
  loadPendingTeamAssignmentBatch: (...args: unknown[]) => mockLoadPendingTeamAssignmentBatch(...args),
  reassignTeamAssignment: (...args: unknown[]) => mockReassignTeamAssignment(...args),
  removeTeamAssignmentBatchItem: (...args: unknown[]) => mockRemoveTeamAssignmentBatchItem(...args),
  updateTeamAssignmentState: (...args: unknown[]) => mockUpdateTeamAssignmentState(...args)
}));
jest.mock('../src/lib/teamMembers', () => ({
  loadTeamMembers: (...args: unknown[]) => mockLoadTeamMembers(...args),
  promoteTeamMemberToLeader: (...args: unknown[]) => mockPromoteTeamMemberToLeader(...args)
}));

jest.mock('../lib/ocr', () => {
  class MockBlurryImageError extends Error {
    constructor(message = 'Image too blurry, retake') {
      super(message);
      this.name = 'BlurryImageError';
    }
  }

  return {
    BlurryImageError: MockBlurryImageError,
    extractText: (...args: unknown[]) => mockExtractText(...args)
  };
});

jest.mock('../store/scanner', () => ({
  garbageCollectOrphanedQueueImages: (...args: unknown[]) => mockGarbageCollect(...args),
  syncScannerQueueStoreNamespace: (...args: unknown[]) => mockSyncScannerQueueStoreNamespace(...args),
  scannerQueueStore: {
    getState: () => ({ queue: mockQueue, history: mockHistory, systemNotice: mockSystemNotice })
  },
  useScannerQueueStore: (selector: (state: unknown) => unknown) => selector({
    queue: mockQueue,
    history: mockHistory,
    systemNotice: mockSystemNotice,
    enqueue: mockEnqueue,
    clearHistory: jest.fn(),
    clearSystemNotice: mockClearSystemNotice,
    retry: mockRetry,
    drainOnce: mockDrainOnce
  })
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>
  };
});

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    BottomSheetModal: React.forwardRef((props: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        dismiss: jest.fn(),
        present: mockBottomSheetPresent
      }));

      return <View>{props.children}</View>;
    }),
    BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    BottomSheetView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    BottomSheetFlatList: ({ data, renderItem, keyExtractor }: { data: unknown[]; renderItem: (params: { item: unknown; index: number }) => React.ReactNode; keyExtractor: (item: unknown) => string }) => (
      <View>
        {data.map((item, index) => (
          <View key={keyExtractor(item)}>{renderItem({ item, index })}</View>
        ))}
      </View>
    )
  };
});

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    CameraView: React.forwardRef((props: { testID?: string }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: mockTakePictureAsync
      }));

      return <View testID={props.testID} />;
    }),
    useCameraPermissions: () => mockUseCameraPermissions()
  };
});

async function openCamera(): Promise<void> {
  fireEvent.press(screen.getByTestId('camera-fab'));

  await act(async () => {
    await Promise.resolve();
  });
}

async function renderAppReady(): Promise<void> {
  render(<App />);

  await act(async () => {
    await Promise.resolve();
  });
}

describe('App permissions flow', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockQueue = [];
    mockHistory = [];
    mockSystemNotice = null;
    Object.defineProperty(globalThis, '__DEV__', {
      configurable: true,
      value: true
    });
    mockUseNetInfo.mockReturnValue({ isConnected: true });
    mockGarbageCollect.mockResolvedValue(undefined);
    mockDrainOnce.mockResolvedValue(undefined);
    mockGetActiveTeamId.mockResolvedValue(null);
    mockSetActiveTeamId.mockResolvedValue(undefined);
    mockLoadAccessibleTeams.mockResolvedValue([]);
    mockCreateTeam.mockResolvedValue({
      createdAt: '2026-05-04T10:00:00Z',
      createdBy: 'user-1',
      id: 'team-1',
      name: 'Main Team'
    });
    mockCreateTeamInvite.mockResolvedValue({
      teamId: 'team-1',
      createdAt: '2026-05-04T10:00:00Z',
      id: 'invite-1',
      invitedEmail: 'worker@example.com',
      status: 'pending'
    });
    mockLoadTeamMembers.mockResolvedValue([
      {
        createdAt: '2026-05-04T10:00:00Z',
        email: 'user@example.com',
        isLeader: true,
        userId: 'user-1'
      }
    ]);
    mockPromoteTeamMemberToLeader.mockResolvedValue(undefined);
    mockUpdateTeamAssignmentState.mockResolvedValue(undefined);
    mockListPendingTeamInvitesForEmail.mockResolvedValue([]);
    mockListPendingTeamInvitesForTeam.mockResolvedValue([]);
    mockRespondToTeamInvite.mockResolvedValue(undefined);
    mockCreateTeamAssignmentBatch.mockResolvedValue({
      batchId: 'batch-1',
      scanCount: 2
    });
    mockApproveTeamAssignmentBatch.mockResolvedValue({
      assignedCount: 2
    });
    mockLoadPendingTeamAssignmentBatch.mockResolvedValue(null);
    mockAddTeamAssignmentBatchItem.mockResolvedValue(undefined);
    mockRemoveTeamAssignmentBatchItem.mockResolvedValue(undefined);
    mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn()
        }
      }
    });
    mockPrepareImage.mockResolvedValue({ cachePath: 'file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg' });
    mockExtractText.mockResolvedValue('John Doe\nAcme Corp\nSales Manager');
    mockLoadTeamInboxReview.mockResolvedValue({
      activeTeamId: null,
      teamName: null,
      items: [],
      mode: 'worker-history'
    });
    mockReassignTeamAssignment.mockResolvedValue(undefined);
    await AsyncStorage.clear();
  });

  it('hydrates the signed-in session on mount', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);

    await renderAppReady();

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockSyncScannerQueueStoreNamespace).toHaveBeenCalledWith('user-1');
  });

  it('renders the auth screen when there is no signed-in session', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    await renderAppReady();

    expect(screen.getByText('Auth screen')).toBeTruthy();
  });

  it('shows a blocking pending-invite gate for signed-in users and resolves on accept', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockListPendingTeamInvitesForEmail.mockResolvedValue([
      {
        id: 'invite-1',
        teamId: 'team-1',
        teamName: 'Main Team',
        createdAt: '2026-05-02T11:00:00.000Z',
        invitedEmail: 'user@example.com'
      }
    ]);

    await renderAppReady();

    expect(screen.getByText('Team invite pending')).toBeTruthy();
    expect(screen.queryAllByText('Dashboard')).toHaveLength(0);

    fireEvent.press(screen.getByTestId('accept-team-invite-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRespondToTeamInvite).toHaveBeenCalledWith('invite-1', 'accept');
    expect(mockSetActiveTeamId).toHaveBeenCalledWith('team-1');
    expect(screen.queryByText('Team invite pending')).toBeNull();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });

  it('renders denied screen and opens settings when permission is denied', async () => {
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();

    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: false },
      jest.fn()
    ]);

    await renderAppReady();
    await openCamera();

    fireEvent.press(screen.getByText('Open Settings'));

    expect(
      screen.getByText(/camera access is required to scan business cards/i)
    ).toBeTruthy();
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
  });

  it('renders dashboard first and opens camera viewfinder when permission is granted', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);

    await renderAppReady();

    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getByTestId('camera-fab')).toBeTruthy();

    await openCamera();

    expect(screen.getByTestId('camera-viewfinder')).toBeTruthy();
    expect(screen.getByTestId('capture-button')).toBeTruthy();
    expect(screen.queryByText('Open Settings')).toBeNull();
  });

  it('renders a history button when completed scans exist', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockHistory = [
      {
        id: 'lead-1',
        imagePath: 'file:///cache/lead-1.jpg',
        parsed: {
          fullName: 'John Doe',
          jobTitle: 'Sales Manager',
          companyName: 'Acme Corp',
          email: 'john@example.com',
          phoneNumber: null
        },
        parseStatus: 'parsed',
        rawText: 'John Doe',
        savedAt: Date.now(),
        storagePath: 'card-images/user-1/lead-1.jpg'
      }
    ];

    await renderAppReady();

    expect(screen.getByTestId('history-button')).toBeTruthy();
  });

  it('auto-selects the first accessible team and lets the user switch teams from team', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockLoadAccessibleTeams.mockResolvedValue([
      {
        createdAt: '2026-05-01T08:00:00Z',
        createdBy: 'leader-1',
        id: 'team-1',
        name: 'North Hall'
      },
      {
        createdAt: '2026-05-01T09:00:00Z',
        createdBy: 'leader-1',
        id: 'team-2',
        name: 'South Hall'
      }
    ]);

    await renderAppReady();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSetActiveTeamId).toHaveBeenCalledWith('team-1');

    fireEvent.press(screen.getByText('Team'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('North Hall')).toBeTruthy();
    expect(screen.getByText('South Hall')).toBeTruthy();

    fireEvent.press(screen.getAllByText('Make active')[0]);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSetActiveTeamId).toHaveBeenCalledWith('team-2');
  });

  it('renders the team inbox for leader review mode', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockLoadTeamInboxReview.mockResolvedValue({
      activeTeamId: 'team-1',
      teamName: 'North Hall',
      mode: 'leader-inbox',
      items: [
        {
          teamId: 'team-1',
          capturedByUserId: 'worker-2',
          companyName: 'Acme',
          createdAt: '2026-05-01T12:00:00Z',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          id: 'lead-2',
          imagePath: 'worker-2/lead-2.jpg',
          jobTitle: 'Engineer',
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Ada'
        }
      ]
    });

    await renderAppReady();

    fireEvent.press(screen.getAllByText('History')[0]);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Team Inbox')).toBeTruthy();
    expect(screen.getByText('North Hall')).toBeTruthy();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
  });

  it('lets a leader create and approve a batch from the team inbox', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockLoadPendingTeamAssignmentBatch
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        batchId: 'batch-7',
        scanCount: 1,
        items: [
          {
            createdAt: '2026-05-04T10:00:00Z',
            scannedLeadId: 'lead-2'
          }
        ]
      });
    mockLoadTeamInboxReview.mockResolvedValue({
      activeTeamId: 'team-1',
      teamName: 'North Hall',
      mode: 'leader-inbox',
      items: [
        {
          teamId: 'team-1',
          capturedByUserId: 'worker-2',
          companyName: 'Acme',
          createdAt: '2026-05-01T12:00:00Z',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          id: 'lead-2',
          imagePath: 'worker-2/lead-2.jpg',
          jobTitle: 'Engineer',
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Ada'
        }
      ]
    });
    mockCreateTeamAssignmentBatch.mockResolvedValue({
      batchId: 'batch-7',
      scanCount: 1
    });

    await renderAppReady();

    fireEvent.press(screen.getAllByText('History')[0]);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByTestId('create-assignment-batch-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCreateTeamAssignmentBatch).toHaveBeenCalledWith('team-1');

    fireEvent.press(screen.getByTestId('approve-assignment-batch-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Create 1 Assignments?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('confirm-approve-assignment-batch-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApproveTeamAssignmentBatch).toHaveBeenCalledWith('batch-7');
  });

  it('lets a leader edit the pending batch from the team inbox', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockLoadPendingTeamAssignmentBatch.mockResolvedValue({
      batchId: 'batch-7',
      scanCount: 1,
      items: [
        {
          createdAt: '2026-05-04T10:00:00Z',
          scannedLeadId: 'lead-2'
        }
      ]
    });
    mockLoadTeamInboxReview.mockResolvedValue({
      activeTeamId: 'team-1',
      teamName: 'North Hall',
      mode: 'leader-inbox',
      items: [
        {
          teamId: 'team-1',
          capturedByUserId: 'worker-2',
          companyName: 'Acme',
          createdAt: '2026-05-01T12:00:00Z',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          id: 'lead-2',
          imagePath: 'worker-2/lead-2.jpg',
          jobTitle: 'Engineer',
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Ada'
        },
        {
          teamId: 'team-1',
          capturedByUserId: 'worker-3',
          companyName: 'Beta',
          createdAt: '2026-05-01T12:10:00Z',
          email: 'grace@example.com',
          fullName: 'Grace Hopper',
          id: 'lead-3',
          imagePath: 'worker-3/lead-3.jpg',
          jobTitle: 'Captain',
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Grace'
        }
      ]
    });
    mockLoadPendingTeamAssignmentBatch.mockResolvedValue({
      batchId: 'batch-7',
      scanCount: 1,
      items: [
        {
          createdAt: '2026-05-04T10:00:00Z',
          scannedLeadId: 'lead-2'
        }
      ]
    });

    await renderAppReady();

    fireEvent.press(screen.getAllByText('History')[0]);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.press(screen.getByTestId('edit-assignment-batch-button'));

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByTestId('remove-batch-item-lead-2'));

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByTestId('add-batch-item-lead-3'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockBottomSheetPresent).toHaveBeenCalledTimes(1);
    expect(mockRemoveTeamAssignmentBatchItem).toHaveBeenCalledWith('batch-7', 'lead-2');
    expect(mockAddTeamAssignmentBatchItem).toHaveBeenCalledWith('batch-7', 'lead-3');
  });

  it('lets a leader reassign an assigned scan from the team inbox', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockGetActiveTeamId.mockResolvedValue('team-1');
    mockLoadAccessibleTeams.mockResolvedValue([
      {
        createdAt: '2026-05-04T10:00:00Z',
        createdBy: 'leader-1',
        id: 'team-1',
        name: 'North Hall'
      }
    ]);
    mockLoadTeamInboxReview.mockResolvedValue({
      activeTeamId: 'team-1',
      teamName: 'North Hall',
      mode: 'leader-inbox',
      items: [
        {
          assignedAt: '2026-05-04T10:00:00Z',
          assignedToUserId: 'worker-2',
          assignmentState: 'assigned',
          teamId: 'team-1',
          capturedByUserId: 'worker-2',
          companyName: 'Acme',
          createdAt: '2026-05-01T12:00:00Z',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          id: 'lead-2',
          imagePath: 'worker-2/lead-2.jpg',
          jobTitle: 'Engineer',
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Ada'
        }
      ]
    });
    mockLoadTeamMembers.mockResolvedValue([
      {
        createdAt: '2026-05-04T10:00:00Z',
        email: 'user@example.com',
        isLeader: true,
        userId: 'user-1'
      },
      {
        createdAt: '2026-05-04T10:01:00Z',
        email: 'worker@example.com',
        isLeader: false,
        userId: 'worker-3'
      }
    ]);
    mockLoadPendingTeamAssignmentBatch.mockResolvedValue(null);

    await renderAppReady();

    fireEvent.press(screen.getAllByText('History')[0]);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.press(screen.getByText('Reassign'));

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByTestId('reassign-lead-2-worker-3'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockReassignTeamAssignment).toHaveBeenCalledWith('lead-2', 'worker-3');
  });

  it('renders worker-scoped history copy for non-leader mode', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockLoadTeamInboxReview.mockResolvedValue({
      activeTeamId: 'team-1',
      teamName: 'North Hall',
      mode: 'worker-history',
      items: [
        {
          teamId: 'team-1',
          capturedByUserId: 'worker-2',
          companyName: 'Acme',
          createdAt: '2026-05-01T12:00:00Z',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          id: 'lead-2',
          imagePath: 'worker-2/lead-2.jpg',
          jobTitle: 'Engineer',
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Ada'
        }
      ]
    });

    await renderAppReady();

    fireEvent.press(screen.getAllByText('History')[0]);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Assignments')).toBeTruthy();
    expect(screen.queryByText('Team Inbox')).toBeNull();
    expect(screen.queryByText('Captured by worker-2')).toBeNull();
  });

  it('switches the color mode from the profile page', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);

    await renderAppReady();

    fireEvent.press(screen.getByText('Profile'));

    await act(async () => {
      await Promise.resolve();
    });

    const initialMode = screen.getByText(/^(Dark|Light)$/).props.children;

    fireEvent.press(screen.getByTestId('color-mode-toggle'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(initialMode === 'Dark' ? 'Light' : 'Dark')).toBeTruthy();
  });

  it('creates a team from the team page and then reveals invite and current team sections', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockCreateTeam.mockResolvedValueOnce({
      createdAt: '2026-05-04T10:00:00Z',
      createdBy: 'user-1',
      id: 'team-9',
      name: 'North Hall'
    });
    mockLoadAccessibleTeams.mockResolvedValueOnce([]);
    mockLoadAccessibleTeams.mockResolvedValueOnce([
      {
        createdAt: '2026-05-04T10:00:00Z',
        createdBy: 'user-1',
        id: 'team-9',
        name: 'North Hall'
      }
    ]);

    await renderAppReady();

    fireEvent.press(screen.getByText('Team'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText('Active Team')).toBeNull();
    expect(screen.queryByText('Pending Invite')).toBeNull();

    fireEvent.changeText(screen.getByTestId('team-name-input'), 'North Hall');
    fireEvent.press(screen.getByTestId('create-team-button'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateTeam).toHaveBeenCalledWith('North Hall');
    expect(mockSetActiveTeamId).toHaveBeenCalledWith('team-9');
    await waitFor(() => {
      expect(screen.getByText('Active Team')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText('Pending Invite')).toBeTruthy();
    });
    expect(screen.queryByText('Switch Team')).toBeNull();
  });

  it('sends a team invite from the team page', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockLoadAccessibleTeams.mockResolvedValue([
      {
        createdAt: '2026-05-04T10:00:00Z',
        createdBy: 'user-1',
        id: 'team-1',
        name: 'Main Team'
      }
    ]);
    mockLoadTeamMembers.mockResolvedValue([
      {
        createdAt: '2026-05-04T10:00:00Z',
        email: 'user@example.com',
        isLeader: true,
        userId: 'user-1'
      }
    ]);

    await renderAppReady();

    fireEvent.press(screen.getByText('Team'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Pending Invite')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('invite-email-input'), 'worker@example.com');
    fireEvent.press(screen.getByTestId('create-invite-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCreateTeamInvite).toHaveBeenCalledWith({
      teamId: 'team-1',
      invitedEmail: 'worker@example.com'
    });
  });

  it('updates assignment state from the worker history rows', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockLoadTeamInboxReview.mockResolvedValue({
      activeTeamId: 'team-1',
      teamName: 'North Hall',
      mode: 'worker-history',
      items: [
        {
          assignedAt: '2026-05-04T10:00:00Z',
          assignmentState: 'assigned',
          teamId: 'team-1',
          capturedByUserId: 'worker-2',
          companyName: 'Acme',
          createdAt: '2026-05-01T12:00:00Z',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          id: 'lead-2',
          imagePath: 'worker-2/lead-2.jpg',
          jobTitle: 'Engineer',
          parseStatus: 'parsed',
          phoneNumber: null,
          rawText: 'Ada'
        }
      ]
    });

    await renderAppReady();

    fireEvent.press(screen.getAllByText('History')[0]);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByText('Done'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockUpdateTeamAssignmentState).toHaveBeenCalledWith('lead-2', 'done');
  });

  it('renders a snackbar when a system notice exists', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockSystemNotice = {
      kind: 'success',
      title: 'Saved',
      message: 'Scan saved to cloud',
      createdAt: Date.now()
    };

    await renderAppReady();

    expect(screen.getByTestId('system-snackbar')).toBeTruthy();
    expect(screen.getByText('Saved: Scan saved to cloud')).toBeTruthy();
  });

  it('renders a dev gallery picker button and routes selected image through capture pipeline', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockGetActiveTeamId.mockResolvedValue('team-77');
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      assets: [{ uri: 'file:///tmp/gallery-card.jpg' }],
      canceled: false
    });

    const leadId = '5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8';
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        ...(globalThis.crypto ?? {}),
        randomUUID: jest.fn().mockReturnValue(leadId)
      }
    });

    await renderAppReady();
    await openCamera();

    fireEvent.press(screen.getByTestId('pick-from-gallery-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      quality: 1
    });
    expect(mockPrepareImage).toHaveBeenCalledWith('file:///tmp/gallery-card.jpg', leadId);
    expect(mockExtractText).toHaveBeenCalledWith('file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg');
    expect(screen.getByText('Review scan')).toBeTruthy();

    fireEvent.press(screen.getByTestId('save-ocr-review-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockEnqueue).toHaveBeenCalledWith({
      teamId: 'team-77',
      id: leadId,
      imagePath: 'file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg',
      rawText: 'John Doe\nAcme Corp\nSales Manager'
    });
  });

  it('does not render pick from gallery button in non-dev builds', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    Object.defineProperty(globalThis, '__DEV__', {
      configurable: true,
      value: false
    });

    await renderAppReady();
    await openCamera();

    expect(screen.queryByText('Gallery')).toBeNull();
    expect(screen.queryByTestId('pick-from-gallery-button')).toBeNull();
  });

  it('captures once per tap burst while the capture call is in flight', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);

    let resolveCapture: ((value: { uri: string; width: number; height: number }) => void) | null = null;

    mockTakePictureAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        })
    );

    await renderAppReady();
    await openCamera();

    const captureButton = screen.getByTestId('capture-button');

    fireEvent.press(captureButton);
    fireEvent.press(captureButton);

    expect(mockTakePictureAsync).toHaveBeenCalledTimes(1);
    expect(mockTakePictureAsync).toHaveBeenCalledWith({
      quality: 0.7,
      skipProcessing: true
    });
    expect(screen.getByTestId('capture-button').props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      resolveCapture?.({
        height: 100,
        uri: 'file:///tmp/card.jpg',
        width: 200
      });
      await Promise.resolve();
    });

    expect(screen.getByText('Review scan')).toBeTruthy();
  });

  it('runs prepare -> OCR -> review -> enqueue without spinner', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockGetActiveTeamId.mockResolvedValue('team-99');
    mockTakePictureAsync.mockResolvedValue({
      height: 100,
      uri: 'file:///tmp/card.jpg',
      width: 200
    });

    const leadId = '5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8';
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        ...(globalThis.crypto ?? {}),
        randomUUID: jest.fn().mockReturnValue(leadId)
      }
    });

    await renderAppReady();
    await openCamera();

    fireEvent.press(screen.getByTestId('capture-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockPrepareImage).toHaveBeenCalledWith('file:///tmp/card.jpg', leadId);
    expect(mockExtractText).toHaveBeenCalledWith('file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg');
    expect(screen.getByText('Review scan')).toBeTruthy();
    expect(mockEnqueue).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('save-ocr-review-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockEnqueue).toHaveBeenCalledWith({
      teamId: 'team-99',
      id: leadId,
      imagePath: 'file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg',
      rawText: 'John Doe\nAcme Corp\nSales Manager'
    });
    expect(screen.queryByTestId('pipeline-spinner')).toBeNull();
    expect(screen.queryByTestId('capture-preview')).toBeNull();
    expect(screen.queryByText('Review scan')).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('continues capture routing without team context when active team lookup fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockGetActiveTeamId.mockRejectedValue(new Error('context lookup failed'));
    mockTakePictureAsync.mockResolvedValue({
      height: 100,
      uri: 'file:///tmp/card.jpg',
      width: 200
    });

    const leadId = '5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8';
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        ...(globalThis.crypto ?? {}),
        randomUUID: jest.fn().mockReturnValue(leadId)
      }
    });

    await renderAppReady();
    await openCamera();

    fireEvent.press(screen.getByTestId('capture-button'));

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByTestId('save-ocr-review-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockEnqueue).toHaveBeenCalledWith({
      teamId: null,
      id: leadId,
      imagePath: 'file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg',
      rawText: 'John Doe\nAcme Corp\nSales Manager'
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Team directory load failed',
      expect.any(Error)
    );
  });

  it('shows blurry retake alert and aborts enqueue when OCR throws BlurryImageError', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockTakePictureAsync.mockResolvedValue({
      height: 100,
      uri: 'file:///tmp/blank.jpg',
      width: 200
    });
    mockExtractText.mockRejectedValue(new BlurryImageError());

    await renderAppReady();
    await openCamera();

    fireEvent.press(screen.getByTestId('capture-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('Image too blurry, retake');
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(screen.getByTestId('camera-viewfinder')).toBeTruthy();
  });

  it('shows corner pill count and opens retry sheet when tapped', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockQueue = [
      {
        id: 'lead-1',
        status: 'uploading',
        imagePath: 'file:///cache/lead-1.jpg',
        rawText: 'text',
        retryCount: 0
      },
      {
        id: 'lead-2',
        status: 'failed',
        imagePath: 'file:///cache/lead-2.jpg',
        rawText: 'text',
        retryCount: 1,
        error: 'Network failed'
      }
    ];

    await renderAppReady();
    await openCamera();

    expect(screen.getByText('Saving 1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('saving-pill'));
    expect(mockBottomSheetPresent).toHaveBeenCalledTimes(1);
  });

  it('drains the queue in a worker effect when queue is non-empty and online', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockQueue = [
      {
        id: 'lead-1',
        status: 'uploading',
        imagePath: 'file:///cache/lead-1.jpg',
        rawText: 'text',
        retryCount: 0
      }
    ];

    await renderAppReady();

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDrainOnce.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not drain the queue in a worker effect when offline', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockUseNetInfo.mockReturnValue({ isConnected: false });
    mockQueue = [
      {
        id: 'lead-1',
        status: 'uploading',
        imagePath: 'file:///cache/lead-1.jpg',
        rawText: 'text',
        retryCount: 0
      }
    ];

    await renderAppReady();

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDrainOnce).not.toHaveBeenCalled();
  });
});
