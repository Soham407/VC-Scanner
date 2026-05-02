import { Easing } from 'react-native-reanimated';

export const motion = {
  duration: {
    short2: 100,
    short4: 200,
    medium1: 250,
    medium2: 300,
    medium4: 400,
    long2: 500
  },
  easing: {
    emphasized: Easing.bezier(0.05, 0.7, 0.1, 1),
    emphasizedExit: Easing.bezier(0.3, 0, 0.8, 0.15),
    standard: Easing.bezier(0.2, 0, 0, 1),
    standardExit: Easing.bezier(0.3, 0, 1, 1)
  },
  spring: {
    defaultSpatial: {
      damping: 28,
      mass: 1,
      stiffness: 260
    },
    fastEffects: {
      damping: 22,
      mass: 0.75,
      stiffness: 520
    },
    fastSpatial: {
      damping: 18,
      mass: 0.8,
      stiffness: 420
    }
  }
} as const;
