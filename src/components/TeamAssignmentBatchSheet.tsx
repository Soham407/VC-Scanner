import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { forwardRef, useMemo, type ForwardedRef } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Surface, Text } from '../design/openDesign';

import type { TeamInboxItem } from '../lib/teamInbox';
import { useAppTheme } from '../theme/materialTheme';

type TeamAssignmentBatchSheetProps = {
  availableItems: TeamInboxItem[];
  batchItems: TeamInboxItem[];
  batchScanCount: number;
  isLoading: boolean;
  onAddItem: (scannedLeadId: string) => void;
  onRemoveItem: (scannedLeadId: string) => void;
};

function TeamAssignmentBatchSheetImpl(
  {
    availableItems,
    batchItems,
    batchScanCount,
    isLoading,
    onAddItem,
    onRemoveItem
  }: TeamAssignmentBatchSheetProps,
  ref: ForwardedRef<BottomSheetModal>
) {
  const snapPoints = useMemo(() => ['58%', '90%'], []);
  const theme = useAppTheme();

  const renderSummaryText = batchItems.length > 0
    ? `${batchItems.length} card${batchItems.length === 1 ? '' : 's'} ready to assign`
    : 'No cards are selected yet.';
  const syncSummary = batchScanCount > batchItems.length
    ? `${batchScanCount - batchItems.length} card${batchScanCount - batchItems.length === 1 ? '' : 's'} still saving.`
    : '';

  return (
    <BottomSheetModal ref={ref} snapPoints={snapPoints}>
      <BottomSheetView style={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <Surface elevation={0} style={[styles.headerCard, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
          <View style={styles.headerCopy}>
            <Text style={styles.title} variant="titleLarge">
              Choose cards
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
              Add the cards you want to give to team members now. Leave the rest in the inbox.
            </Text>
          </View>
          <View style={styles.headerMeta}>
            <Chip compact style={styles.summaryChip}>
              {batchItems.length} selected
            </Chip>
            <Chip compact mode="outlined" style={styles.summaryChip}>
              {availableItems.length} open
            </Chip>
          </View>
        </Surface>
        <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12, marginTop: 10 }} variant="bodySmall">
          {renderSummaryText}. {syncSummary}
        </Text>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text variant="titleMedium">Selected cards</Text>
            {batchItems.length === 0 ? (
              <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }} variant="bodyMedium">
                Add a card from the inbox to prepare assignments.
              </Text>
            ) : (
              <View style={styles.list}>
                {batchItems.map((item) => (
                  <Surface
                    key={item.id}
                    elevation={0}
                    style={[styles.row, { backgroundColor: theme.colors.surfaceContainerHighest }]}
                  >
                    {item.imagePath ? <Image source={{ uri: item.imagePath }} style={styles.thumb} /> : null}
                    <View style={styles.rowCopy}>
                      <Text numberOfLines={1} variant="titleSmall">
                        {item.companyName ?? item.fullName ?? item.rawText.split('\n')[0] ?? 'Untitled scan'}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                        {item.fullName ?? item.jobTitle ?? item.email ?? item.id}
                      </Text>
                    </View>
                    <Button
                      compact
                      disabled={isLoading}
                      mode="outlined"
                      onPress={() => onRemoveItem(item.id)}
                      testID={`remove-batch-item-${item.id}`}
                    >
                      Remove
                    </Button>
                  </Surface>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text variant="titleMedium">Cards in inbox</Text>
            {availableItems.length === 0 ? (
              <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }} variant="bodyMedium">
                No unassigned cards are waiting right now.
              </Text>
            ) : (
              <View style={styles.list}>
                {availableItems.map((item) => (
                  <Surface
                    key={item.id}
                    elevation={0}
                    style={[styles.row, { backgroundColor: theme.colors.surfaceContainerHighest }]}
                  >
                    {item.imagePath ? <Image source={{ uri: item.imagePath }} style={styles.thumb} /> : null}
                    <View style={styles.rowCopy}>
                      <Text numberOfLines={1} variant="titleSmall">
                        {item.companyName ?? item.fullName ?? item.rawText.split('\n')[0] ?? 'Untitled scan'}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                        {item.fullName ?? item.jobTitle ?? item.email ?? item.id}
                      </Text>
                    </View>
                    <Button
                      compact
                      disabled={isLoading}
                      mode="contained"
                      onPress={() => onAddItem(item.id)}
                      testID={`add-batch-item-${item.id}`}
                    >
                      Add
                    </Button>
                  </Surface>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

export const TeamAssignmentBatchSheet = forwardRef(TeamAssignmentBatchSheetImpl);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8
  },
  headerCard: {
    borderRadius: 22,
    gap: 12,
    padding: 16
  },
  headerCopy: {
    gap: 8
  },
  headerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  list: {
    gap: 10,
    marginTop: 10
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 12
  },
  rowCopy: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: 28
  },
  section: {
    marginBottom: 20
  },
  summaryChip: {
    alignSelf: 'flex-start'
  },
  thumb: {
    borderRadius: 10,
    height: 44,
    width: 44
  },
  title: {
    marginBottom: 8
  }
});
