jest.mock(
  '@env',
  () => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'example-key'
  }),
  { virtual: true }
);

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const ReactNative = require('react-native');

  const createAnimationBuilder = () => {
    const builder = {
      delay: () => builder,
      damping: () => builder,
      duration: () => builder,
      easing: () => builder,
      springify: () => builder,
      stiffness: () => builder
    };

    return builder;
  };

  return {
    __esModule: true,
    default: {
      Image: ReactNative.Image,
      View: ReactNative.View
    },
    Easing: {
      bezier: jest.fn()
    },
    FadeIn: createAnimationBuilder(),
    FadeInDown: createAnimationBuilder(),
    FadeInUp: createAnimationBuilder(),
    FadeOut: createAnimationBuilder(),
    FadeOutUp: createAnimationBuilder(),
    LinearTransition: createAnimationBuilder(),
    useAnimatedStyle: (worklet: () => unknown) => worklet(),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value
  };
});
