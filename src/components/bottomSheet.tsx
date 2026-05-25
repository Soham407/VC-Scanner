import { forwardRef, useImperativeHandle, useState, type ReactNode } from 'react';
import { FlatList, Platform, View, type FlatListProps, type ViewProps } from 'react-native';

export type BottomSheetModalHandle = {
  close: () => void;
  dismiss: () => void;
  present: () => void;
};

type BottomSheetModalProps = {
  children?: ReactNode;
  snapPoints?: readonly string[];
  style?: ViewProps['style'];
};

const isWeb = Platform.OS === 'web';

function getNativeBottomSheet(): typeof import('@gorhom/bottom-sheet') | null {
  if (isWeb) {
    return null;
  }

  return require('@gorhom/bottom-sheet') as typeof import('@gorhom/bottom-sheet');
}

export const BottomSheetModalProvider = ({ children }: { children: ReactNode }) => {
  if (isWeb) {
    return <>{children}</>;
  }

  const native = getNativeBottomSheet();
  const Provider = native?.BottomSheetModalProvider;
  return Provider ? <Provider>{children}</Provider> : <>{children}</>;
};

export const BottomSheetModal = forwardRef<BottomSheetModalHandle, BottomSheetModalProps>(
  ({ children, style }, ref) => {
    const [visible, setVisible] = useState(false);

    useImperativeHandle(ref, () => ({
      close: () => setVisible(false),
      dismiss: () => setVisible(false),
      present: () => setVisible(true)
    }), []);

    if (!isWeb) {
      const native = getNativeBottomSheet();
      const NativeBottomSheetModal = native?.BottomSheetModal;
      if (NativeBottomSheetModal) {
        return <NativeBottomSheetModal ref={ref as never} style={style}>{children}</NativeBottomSheetModal>;
      }
    }

    if (!visible) {
      return null;
    }

    return (
      <View style={style}>
        {children}
      </View>
    );
  }
);

export function BottomSheetView({ children, style }: { children?: ReactNode; style?: ViewProps['style'] }) {
  if (!isWeb) {
    const native = getNativeBottomSheet();
    const NativeBottomSheetView = native?.BottomSheetView;
    if (NativeBottomSheetView) {
      return <NativeBottomSheetView style={style}>{children}</NativeBottomSheetView>;
    }
  }

  return <View style={style}>{children}</View>;
}

export function BottomSheetFlatList<ItemT>(props: FlatListProps<ItemT>) {
  if (!isWeb) {
    const native = getNativeBottomSheet();
    const NativeBottomSheetFlatList = native?.BottomSheetFlatList;
    if (NativeBottomSheetFlatList) {
      return <NativeBottomSheetFlatList {...props} />;
    }
  }

  return <FlatList {...props} />;
}
