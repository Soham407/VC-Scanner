import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { JSX } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { Surface, Text } from 'react-native-paper';

import { useAppTheme } from '../theme/materialTheme';
import { motion } from '../theme/motion';

type MotionBottomNavRoute<T extends string> = {
  focusedIcon: string;
  key: T;
  title: string;
  unfocusedIcon: string;
};

type MotionBottomNavProps<T extends string> = {
  activeKey: T;
  bottomInset: number;
  onChange: (key: T) => void;
  routes: Array<MotionBottomNavRoute<T>>;
};

export function MotionBottomNav<T extends string>({
  activeKey,
  bottomInset,
  onChange,
  routes
}: MotionBottomNavProps<T>): JSX.Element {
  const theme = useAppTheme();

  return (
    <Surface
      elevation={2}
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surfaceContainer,
          paddingBottom: Math.max(bottomInset, 8)
        }
      ]}
    >
      {routes.map((route) => (
        <MotionBottomNavItem
          active={route.key === activeKey}
          key={route.key}
          onPress={() => onChange(route.key)}
          route={route}
        />
      ))}
    </Surface>
  );
}

function MotionBottomNavItem<T extends string>({
  active,
  onPress,
  route
}: {
  active: boolean;
  onPress: () => void;
  route: MotionBottomNavRoute<T>;
}): JSX.Element {
  const theme = useAppTheme();
  const pressProgress = useSharedValue(0);
  const itemStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressProgress.value ? 0.94 : 1, motion.spring.fastEffects)
      }
    ]
  }));

  return (
    <Animated.View layout={LinearTransition.springify().damping(26).stiffness(360)} style={styles.item}>
      <Animated.View style={itemStyle}>
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
          style={styles.pressable}
        >
          <Animated.View
            layout={LinearTransition.springify().damping(26).stiffness(360)}
            style={[
              styles.iconPill,
              active && {
                backgroundColor: theme.colors.secondaryContainer
              }
            ]}
          >
            <MaterialCommunityIcons
              color={active ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant}
              name={(active ? route.focusedIcon : route.unfocusedIcon) as keyof typeof MaterialCommunityIcons.glyphMap}
              size={24}
            />
          </Animated.View>
          <Text
            numberOfLines={1}
            style={{
              color: active ? theme.colors.onSurface : theme.colors.onSurfaceVariant
            }}
            variant="labelMedium"
          >
            {route.title}
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    bottom: 0,
    flexDirection: 'row',
    gap: 4,
    left: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    position: 'absolute',
    right: 0
  },
  iconPill: {
    alignItems: 'center',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    minWidth: 64
  },
  item: {
    flex: 1
  },
  pressable: {
    alignItems: 'center',
    gap: 4,
    minHeight: 56,
    paddingVertical: 4
  }
});
