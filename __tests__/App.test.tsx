import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import App from '../App';
import { BlurryImageError } from '../lib/ocr';
import { ScanCardInvokeError } from '../src/lib/scanCard';

const mockUseCameraPermissions = jest.fn();
const mockTakePictureAsync = jest.fn();
const mockExtractText = jest.fn();
const mockPrepareImage = jest.fn();
const mockUploadCardImage = jest.fn();
const mockInvokeScanCard = jest.fn();

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn()
}));

jest.mock('../src/lib/imagePrep', () => ({
  prepareImage: (...args: unknown[]) => mockPrepareImage(...args)
}));

jest.mock('../src/lib/upload', () => ({
  uploadCardImage: (...args: unknown[]) => mockUploadCardImage(...args)
}));

jest.mock('../src/lib/scanCard', () => {
  class MockScanCardInvokeError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ScanCardInvokeError';
    }
  }

  return {
    ScanCardInvokeError: MockScanCardInvokeError,
    invokeScanCard: (...args: unknown[]) => mockInvokeScanCard(...args)
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

describe('App permissions flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockPrepareImage.mockResolvedValue({ cachePath: 'file:///cache/prepared.jpg' });
    mockExtractText.mockResolvedValue('John Doe\\nAcme Corp\\nSales Manager');
    mockUploadCardImage.mockResolvedValue('card-images/user-123/lead-456.jpg');
    mockInvokeScanCard.mockResolvedValue({
      parseStatus: 'parsed',
      parsed: {
        companyName: 'Acme Corp',
        email: 'john@acme.com',
        fullName: 'John Doe',
        jobTitle: 'Sales Manager',
        phoneNumber: '+1 555 111 2222'
      }
    });
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

  it('renders dev upload test surface controls in __DEV__ builds', () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);

    render(<App />);

    expect(screen.getByText('Pick image')).toBeTruthy();
    expect(screen.getByText('Prepare')).toBeTruthy();
    expect(screen.getByText('Upload')).toBeTruthy();
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

  it('runs prepare -> OCR -> upload -> invoke sequentially with shared leadId and spinner', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
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

    let resolveInvoke: ((value: { parseStatus: 'parsed' | 'unparsed'; parsed: object }) => void) | null = null;
    mockInvokeScanCard.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInvoke = resolve;
        })
    );

    render(<App />);

    fireEvent.press(screen.getByTestId('capture-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('pipeline-spinner')).toBeTruthy();
    expect(mockPrepareImage).toHaveBeenCalledWith('file:///tmp/card.jpg');
    expect(mockExtractText).toHaveBeenCalledWith('file:///cache/prepared.jpg');
    expect(mockUploadCardImage).toHaveBeenCalledWith('file:///cache/prepared.jpg', leadId);
    expect(mockInvokeScanCard).toHaveBeenCalledWith({
      imagePath: 'card-images/user-123/lead-456.jpg',
      leadId,
      rawText: 'John Doe\\nAcme Corp\\nSales Manager'
    });

    await act(async () => {
      resolveInvoke?.({
        parseStatus: 'parsed',
        parsed: {
          companyName: 'Acme Corp',
          email: 'john@acme.com',
          fullName: 'John Doe',
          jobTitle: 'Sales Manager',
          phoneNumber: '+1 555 111 2222'
        }
      });
      await Promise.resolve();
    });

    expect(screen.queryByTestId('pipeline-spinner')).toBeNull();
    expect(screen.queryByTestId('capture-preview')).toBeNull();
    expect(screen.getByTestId('camera-viewfinder')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows blurry retake alert and aborts upload/invoke when OCR throws BlurryImageError', async () => {
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
    expect(mockUploadCardImage).not.toHaveBeenCalled();
    expect(mockInvokeScanCard).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pipeline-spinner')).toBeNull();
    expect(screen.getByTestId('camera-viewfinder')).toBeTruthy();
  });

  it('shows a clear alert and returns to viewfinder when Edge Function invocation fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockTakePictureAsync.mockResolvedValue({
      height: 100,
      uri: 'file:///tmp/card.jpg',
      width: 200
    });
    mockInvokeScanCard.mockRejectedValue(new ScanCardInvokeError('Network request failed'));

    render(<App />);

    fireEvent.press(screen.getByTestId('capture-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('Scan failed', 'Network request failed');
    expect(screen.queryByTestId('pipeline-spinner')).toBeNull();
    expect(screen.getByTestId('camera-viewfinder')).toBeTruthy();
  });
});
