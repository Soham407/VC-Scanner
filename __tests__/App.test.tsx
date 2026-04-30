import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import App from '../App';

const mockUseCameraPermissions = jest.fn();

jest.mock('expo-camera', () => ({
  CameraView: (props: { testID?: string }) => {
    const { View } = require('react-native');

    return <View testID={props.testID} />;
  },
  useCameraPermissions: () => mockUseCameraPermissions()
}));

describe('App permissions flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders denied screen and opens settings when permission is denied', () => {
    const openSettingsSpy = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue();

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
    expect(screen.queryByText('Open Settings')).toBeNull();
  });
});
