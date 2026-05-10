import { BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { forwardRef, useMemo, type ForwardedRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Chip, Text as PaperText } from '../design/openDesign';

import type { ScannerHistoryItem } from '../../store/scanner';
import { useAppTheme } from '../theme/materialTheme';

type RecentScansSheetProps = {
  items: ScannerHistoryItem[];
};

function RecentScansSheetImpl(
  { items }: RecentScansSheetProps,
  ref: ForwardedRef<BottomSheetModal>
) {
  const snapPoints = useMemo(() => ['36%', '72%'], []);
  const theme = useAppTheme();

  return (
    <BottomSheetModal ref={ref} snapPoints={snapPoints}>
      <BottomSheetView style={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <PaperText style={styles.title} variant="titleLarge">Recent scans</PaperText>
        <BottomSheetFlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <PaperText style={{ color: theme.colors.onSurfaceVariant, paddingTop: 12 }} variant="bodyMedium">
              No completed scans yet.
            </PaperText>
          }
          renderItem={({ item }) => {
            const primaryText = item.parsed.fullName ?? item.parsed.companyName ?? item.id;
            const secondaryText = item.parsed.companyName ?? item.parsed.jobTitle ?? item.rawText.split('\n')[0] ?? '';

            return (
              <View style={[styles.row, { backgroundColor: theme.colors.surfaceContainer }]}>
                <Image source={{ uri: item.imagePath }} style={styles.thumb} />
                <View style={styles.meta}>
                  <PaperText numberOfLines={1} variant="titleSmall">{primaryText}</PaperText>
                  <PaperText
                    numberOfLines={1}
                    style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                    variant="bodySmall"
                  >
                    {secondaryText}
                  </PaperText>
                  <Chip compact style={styles.chip}>{item.parseStatus === 'parsed' ? 'Saved' : 'Review'}</Chip>
                </View>
                <View
                  style={[styles.timestampPill, { backgroundColor: theme.colors.surfaceContainerHigh }]}
                  testID={`history-${item.id}`}
                >
                  <PaperText style={{ color: theme.colors.onSurfaceVariant }} variant="labelSmall">
                    {new Date(item.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </PaperText>
                </View>
              </View>
            );
          }}
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

export const RecentScansSheet = forwardRef(RecentScansSheetImpl);

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
    padding: 12,
    paddingVertical: 10
  },
  thumb: {
    borderRadius: 8,
    height: 52,
    width: 52
  },
  timestampPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  title: {
    marginBottom: 8
  }
});
