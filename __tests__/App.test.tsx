import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import App from '../App';

const mockUseCameraPermissions = jest.fn();
const mockTakePictureAsync = jest.fn();

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn()
}));

jest.mock('../src/lib/imagePrep', () => ({
  prepareImage: jest.fn()
}));

jest.mock('../src/lib/upload', () => ({
  uploadCardImage: jest.fn()
}));

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
});
