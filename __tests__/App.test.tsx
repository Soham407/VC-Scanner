import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import App from '../App';
import { BlurryImageError } from '../lib/ocr';

const mockUseCameraPermissions = jest.fn();
const mockTakePictureAsync = jest.fn();
const mockExtractText = jest.fn();

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

  it('captures once per tap burst, shows preview briefly, then returns to camera', async () => {
    jest.useFakeTimers();

    try {
      mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);

      let resolveCapture: ((value: { uri: string; width: number; height: number }) => void) | null =
        null;

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

      expect(screen.getByTestId('capture-preview')).toBeTruthy();

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(screen.queryByTestId('capture-preview')).toBeNull();
      expect(screen.getByTestId('capture-button').props.accessibilityState?.disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows OCR text in a dev-only alert after capture', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
    mockTakePictureAsync.mockResolvedValue({
      height: 100,
      uri: 'file:///tmp/card.jpg',
      width: 200
    });
    mockExtractText.mockResolvedValue('John Doe\nAcme Corp\nSales Manager');

    render(<App />);

    fireEvent.press(screen.getByTestId('capture-button'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockExtractText).toHaveBeenCalledWith('file:///tmp/card.jpg');

    if (__DEV__) {
      expect(alertSpy).toHaveBeenCalledWith('OCR text', 'John Doe\nAcme Corp\nSales Manager');
    }
  });

  it('shows blurry retake alert when OCR throws BlurryImageError', async () => {
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
  });
});
