import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, View } from 'react-native';

import App from '../App';
import { BlurryImageError } from '../lib/ocr';

const mockUseCameraPermissions = jest.fn();
const mockBootstrapAnonymousSession = jest.fn().mockResolvedValue(undefined);
const mockTakePictureAsync = jest.fn();
const mockExtractText = jest.fn();
const mockPrepareImage = jest.fn();
const mockEnqueue = jest.fn();
const mockRetry = jest.fn();
const mockDrainOnce = jest.fn();
const mockGarbageCollect = jest.fn();
const mockGetActiveBoothId = jest.fn();
const mockBottomSheetPresent = jest.fn();
const mockUseNetInfo = jest.fn();

let mockQueue: Array<{ id: string; status: 'uploading' | 'parsing' | 'failed'; imagePath: string; rawText: string; retryCount: number; error?: string }> = [];

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn()
}));

jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => mockUseNetInfo()
}));

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
  bootstrapAnonymousSession: (...args: unknown[]) => mockBootstrapAnonymousSession(...args)
}));

jest.mock('../src/lib/boothContext', () => ({
  getActiveBoothId: (...args: unknown[]) => mockGetActiveBoothId(...args)
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
  scannerQueueStore: {
    getState: () => ({ queue: mockQueue })
  },
  useScannerQueueStore: (selector: (state: unknown) => unknown) => selector({
    queue: mockQueue,
    enqueue: mockEnqueue,
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

describe('App permissions flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueue = [];
    Object.defineProperty(globalThis, '__DEV__', {
      configurable: true,
      value: true
    });
    mockUseNetInfo.mockReturnValue({ isConnected: true });
    mockGarbageCollect.mockResolvedValue(undefined);
    mockDrainOnce.mockResolvedValue(undefined);
    mockGetActiveBoothId.mockResolvedValue(null);
    mockPrepareImage.mockResolvedValue({ cachePath: 'file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg' });
    mockExtractText.mockResolvedValue('John Doe\nAcme Corp\nSales Manager');
  });

  it('bootstraps an anonymous Supabase session on mount', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);

    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockBootstrapAnonymousSession).toHaveBeenCalledTimes(1);
  });

  it('renders denied screen and opens settings when permission is denied', () => {
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();

    mockUseCameraPermissions.mockReturnValue([
      { granted: false, canAskAgain: false },
      jest.fn()
    ]);

    render(<App />);

    fireEvent.press(screen.getByText('Open Settings'));

    expect(
      screen.getByText(/camera access is required to scan business cards/i)
    ).toBeTruthy();
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
  });

  it('renders camera viewfinder when permission is granted', () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);

    render(<App />);

    expect(screen.getByTestId('camera-viewfinder')).toBeTruthy();
    expect(screen.getByTestId('capture-button')).toBeTruthy();
    expect(screen.queryByText('Open Settings')).toBeNull();
  });

  it('renders a dev gallery picker button and routes selected image through capture pipeline', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockGetActiveBoothId.mockResolvedValue('booth-77');
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

    render(<App />);

    fireEvent.press(screen.getByText('Pick from gallery'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      quality: 1
    });
    expect(mockPrepareImage).toHaveBeenCalledWith('file:///tmp/gallery-card.jpg', leadId);
    expect(mockExtractText).toHaveBeenCalledWith('file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg');
    expect(mockEnqueue).toHaveBeenCalledWith({
      boothId: 'booth-77',
      id: leadId,
      imagePath: 'file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg',
      rawText: 'John Doe\nAcme Corp\nSales Manager'
    });
  });

  it('does not render pick from gallery button in non-dev builds', () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    Object.defineProperty(globalThis, '__DEV__', {
      configurable: true,
      value: false
    });

    render(<App />);

    expect(screen.queryByText('Pick from gallery')).toBeNull();
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

    render(<App />);

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

    expect(screen.getByTestId('capture-button').props.accessibilityState?.disabled).toBe(false);
  });

  it('runs prepare -> OCR -> enqueue and returns to viewfinder without spinner', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockGetActiveBoothId.mockResolvedValue('booth-99');
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

    render(<App />);

    fireEvent.press(screen.getByTestId('capture-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockPrepareImage).toHaveBeenCalledWith('file:///tmp/card.jpg', leadId);
    expect(mockExtractText).toHaveBeenCalledWith('file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg');
    expect(mockEnqueue).toHaveBeenCalledWith({
      boothId: 'booth-99',
      id: leadId,
      imagePath: 'file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg',
      rawText: 'John Doe\nAcme Corp\nSales Manager'
    });
    expect(screen.queryByTestId('pipeline-spinner')).toBeNull();
    expect(screen.queryByTestId('capture-preview')).toBeNull();
    expect(screen.getByTestId('camera-viewfinder')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('continues capture routing without booth context when active booth lookup fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockGetActiveBoothId.mockRejectedValue(new Error('context lookup failed'));
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

    render(<App />);

    fireEvent.press(screen.getByTestId('capture-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockEnqueue).toHaveBeenCalledWith({
      boothId: null,
      id: leadId,
      imagePath: 'file:///cache/lead-5b8d3c26-7d8d-43d5-8ea0-6bcd260b89f8.jpg',
      rawText: 'John Doe\nAcme Corp\nSales Manager'
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Active booth lookup failed; routing capture without booth context',
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

    render(<App />);

    fireEvent.press(screen.getByTestId('capture-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('Image too blurry, retake');
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(screen.getByTestId('camera-viewfinder')).toBeTruthy();
  });

  it('shows corner pill count and opens retry sheet when tapped', () => {
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

    render(<App />);

    expect(screen.getByText('Saving 1...')).toBeTruthy();
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

    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDrainOnce).toHaveBeenCalledTimes(1);
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

    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDrainOnce).not.toHaveBeenCalled();
  });
});
