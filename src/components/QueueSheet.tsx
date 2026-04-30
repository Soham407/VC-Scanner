import { BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { forwardRef, useMemo, type ForwardedRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ScannerQueueItem } from '../../store/scanner';

type QueueSheetProps = {
  items: ScannerQueueItem[];
  onRetry: (id: string) => void;
};

function QueueSheetImpl(
  { items, onRetry }: QueueSheetProps,
  ref: ForwardedRef<BottomSheetModal>
) {
  const snapPoints = useMemo(() => ['45%', '80%'], []);

  return (
    <BottomSheetModal ref={ref} snapPoints={snapPoints}>
      <BottomSheetView style={styles.container}>
        <Text style={styles.title}>Background Saves</Text>
        <BottomSheetFlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Image source={{ uri: item.imagePath }} style={styles.thumb} />
              <View style={styles.meta}>
                <Text numberOfLines={1} style={styles.idText}>{item.id}</Text>
                <View style={[styles.chip, item.status === 'failed' && styles.failedChip]}>
                  <Text style={styles.chipText}>{item.status}</Text>
                </View>
                {item.error ? <Text numberOfLines={1} style={styles.errorText}>{item.error}</Text> : null}
              </View>
              {item.status === 'failed' ? (
                <Pressable
                  onPress={() => onRetry(item.id)}
                  style={styles.retryButton}
                  testID={`retry-${item.id}`}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
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
    backgroundColor: '#0c7d45',
    borderRadius: 999,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  chipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize'
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  errorText: {
    color: '#b42318',
    fontSize: 12,
    marginTop: 6
  },
  failedChip: {
    backgroundColor: '#b42318'
  },
  idText: {
    color: '#101828',
    fontSize: 12,
    fontWeight: '600'
  },
  meta: {
    flex: 1,
    marginHorizontal: 10
  },
  retryButton: {
    alignSelf: 'center',
    backgroundColor: '#101828',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  retryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 10
  },
  thumb: {
    backgroundColor: '#e4e7ec',
    borderRadius: 8,
    height: 52,
    width: 52
  },
  title: {
    color: '#101828',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8
  }
});
