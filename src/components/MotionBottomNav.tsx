import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { JSX } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { Surface, Text } from '../design/openDesign';

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
  onOpenCamera: () => void;
  routes: Array<MotionBottomNavRoute<T>>;
};

export function MotionBottomNav<T extends string>({
  activeKey,
  bottomInset,
  onChange,
  onOpenCamera,
  routes
}: MotionBottomNavProps<T>): JSX.Element {
  const theme = useAppTheme();
  const centerIndex = Math.ceil(routes.length / 2);
  const leftRoutes = routes.slice(0, centerIndex);
  const rightRoutes = routes.slice(centerIndex);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.shell,
        {
          paddingBottom: Math.max(bottomInset, 8)
        }
      ]}
    >
      <Surface
        elevation={2}
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.surfaceContainerHigh
          }
        ]}
      >
        <View style={styles.routeGroup}>
          {leftRoutes.map((route) => (
            <MotionBottomNavItem
              active={route.key === activeKey}
              key={route.key}
              onPress={() => onChange(route.key)}
              route={route}
            />
          ))}
        </View>
        <View style={styles.centerSpacer} />
        <View style={styles.routeGroup}>
          {rightRoutes.map((route) => (
            <MotionBottomNavItem
              active={route.key === activeKey}
              key={route.key}
              onPress={() => onChange(route.key)}
              route={route}
            />
          ))}
        </View>
      </Surface>

      <MotionCameraAction onPress={onOpenCamera} />
    </View>
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
                backgroundColor: theme.colors.onSurface
              }
            ]}
          >
            <MaterialCommunityIcons
              color={active ? theme.colors.surface : theme.colors.onSurfaceVariant}
              name={(active ? route.focusedIcon : route.unfocusedIcon) as keyof typeof MaterialCommunityIcons.glyphMap}
              size={24}
            />
          </Animated.View>
          <Text
            numberOfLines={1}
            style={{
              color: active ? theme.colors.primary : theme.colors.onSurfaceVariant
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

function MotionCameraAction({ onPress }: { onPress: () => void }): JSX.Element {
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
    <Animated.View pointerEvents="box-none" style={[styles.cameraWrap, itemStyle]}>
      <Pressable
        accessibilityLabel="Open camera"
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={() => {
          pressProgress.value = 1;
        }}
        onPressOut={() => {
          pressProgress.value = 0;
        }}
        style={[
          styles.cameraButton,
          {
            backgroundColor: theme.colors.surfaceContainerHigh,
            borderColor: theme.colors.background
          }
        ]}
        testID="camera-fab"
      >
        <MaterialCommunityIcons
          color={theme.colors.onSurface}
          name="camera"
          size={28}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 76,
    paddingHorizontal: 14,
    paddingTop: 12
  },
  cameraButton: {
    alignItems: 'center',
    borderRadius: 34,
    borderWidth: 6,
    height: 68,
    justifyContent: 'center',
    width: 68
  },
  cameraWrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: -18
  },
  centerSpacer: {
    width: 84
  },
  iconPill: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    minWidth: 52
  },
  item: {
    flex: 1
  },
  pressable: {
    alignItems: 'center',
    gap: 4,
    minHeight: 56,
    paddingVertical: 4
  },
  routeGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: 6
  },
  shell: {
    bottom: 0,
    left: 12,
    position: 'absolute',
    right: 12
  }
});
