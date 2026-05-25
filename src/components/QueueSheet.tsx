import { forwardRef, useMemo, type ForwardedRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Button, Chip, Text } from '../design/openDesign';

import type { ScannerQueueItem } from '../../store/scanner';
import { BottomSheetFlatList, BottomSheetModal, BottomSheetView, type BottomSheetModalHandle } from './bottomSheet';
import { useAppTheme } from '../theme/materialTheme';

type QueueSheetProps = {
  items: ScannerQueueItem[];
  onRetry: (id: string) => void;
};

const statusCopy: Record<ScannerQueueItem['status'], string> = {
  failed: 'Needs retry',
  parsing: 'Finishing',
  uploading: 'Saving'
};

function QueueSheetImpl(
  { items, onRetry }: QueueSheetProps,
  ref: ForwardedRef<BottomSheetModalHandle>
) {
  const snapPoints = useMemo(() => ['45%', '80%'], []);
  const theme = useAppTheme();

  return (
    // BottomSheet is kept for queue retry because it overlays the camera flow.
    <BottomSheetModal ref={ref} snapPoints={snapPoints}>
      <BottomSheetView style={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <Text style={styles.title} variant="titleLarge">
          Saving cards
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }} variant="bodyMedium">
          These cards will finish saving when the connection is available.
        </Text>
        <BottomSheetFlatList
          data={items}
          ListEmptyComponent={
            <Text style={{ color: theme.colors.onSurfaceVariant, paddingTop: 12 }} variant="bodyMedium">
              Nothing is waiting to save right now.
            </Text>
          }
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: theme.colors.surfaceContainer }]}>
              <Image source={{ uri: item.imagePath }} style={styles.thumb} />
              <View style={styles.meta}>
                <Text numberOfLines={1} variant="titleSmall">
                  Card save
                </Text>
                <Chip compact mode="flat" style={styles.chip}>{statusCopy[item.status]}</Chip>
                {item.error ? (
                  <Text numberOfLines={1} style={{ color: theme.colors.error, marginTop: 6 }} variant="bodySmall">
                    Could not save, check your connection and retry.
                  </Text>
                ) : null}
              </View>
              {item.status === 'failed' ? (
                <Button
                  compact
                  mode="contained"
                  onPress={() => onRetry(item.id)}
                  testID={`retry-${item.id}`}
                >
                  Retry
                </Button>
              ) : null}
            </View>
          )}
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

export const QueueSheet = forwardRef(QueueSheetImpl);

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    marginTop: 6
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  meta: {
    flex: 1,
    marginHorizontal: 10
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    borderRadius: 8,
    marginBottom: 10,
    padding: 12
  },
  thumb: {
    borderRadius: 8,
    height: 52,
    width: 52
  },
  title: {
    marginBottom: 8
  }
});
