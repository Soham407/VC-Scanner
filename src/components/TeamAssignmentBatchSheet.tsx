import { forwardRef, useMemo, type ForwardedRef } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Surface, Text, TextInput } from '../design/openDesign';

import type { TeamInboxItem } from '../lib/teamInbox';
import type { TeamMember } from '../lib/teamMembers';
import type { TeamWorkerAllocation } from '../lib/teamAssignments';
import { BottomSheetModal, BottomSheetView, type BottomSheetModalHandle } from './bottomSheet';
import { useAppTheme } from '../theme/materialTheme';

type TeamAssignmentBatchSheetProps = {
  availableItems: TeamInboxItem[];
  batchItems: TeamInboxItem[];
  batchScanCount: number;
  allocations: TeamWorkerAllocation[];
  isLoading: boolean;
  workers: TeamMember[];
  onAddItem: (scannedLeadId: string) => void;
  onRemoveItem: (scannedLeadId: string) => void;
  onChangeAllocation: (userId: string, count: number) => void;
};

function TeamAssignmentBatchSheetImpl(
  {
    availableItems,
    batchItems,
    batchScanCount,
    allocations,
    isLoading,
    workers,
    onAddItem,
    onRemoveItem,
    onChangeAllocation
  }: TeamAssignmentBatchSheetProps,
  ref: ForwardedRef<BottomSheetModalHandle>
) {
  const snapPoints = useMemo(() => ['58%', '90%'], []);
  const theme = useAppTheme();
  const allocationTotal = allocations.reduce((total, allocation) => total + allocation.count, 0);
  const canApproveLater = batchItems.length > 0 && workers.length > 0 && allocationTotal === batchItems.length;

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
              Select team inbox cards and set how many each Worker receives.
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
        <Surface elevation={0} style={[styles.allocationSummary, { backgroundColor: theme.colors.surfaceContainer }]}>
          <View>
            <Text variant="titleSmall">Worker allocation</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
              Split the selected cards across workers. The approval step only works when totals match.
            </Text>
          </View>
          <Chip compact mode={canApproveLater ? 'flat' : 'outlined'} style={styles.summaryChip}>
            {allocationTotal}/{batchItems.length || 0}
          </Chip>
        </Surface>

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
            <Text variant="titleMedium">Worker targets</Text>
            {workers.length === 0 ? (
              <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }} variant="bodyMedium">
                Add workers to this team before approving assignments.
              </Text>
            ) : (
              <View style={styles.list}>
                {workers.map((worker) => {
                  const allocation = allocations.find((entry) => entry.userId === worker.userId);

                  return (
                    <Surface
                      key={worker.userId}
                      elevation={0}
                      style={[styles.allocationRow, { backgroundColor: theme.colors.surfaceContainerHighest }]}
                    >
                      <View style={styles.rowCopy}>
                        <Text numberOfLines={1} variant="titleSmall">
                          {worker.email}
                        </Text>
                        <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                          Worker assignment target
                        </Text>
                      </View>
                      <TextInput
                        keyboardType="number-pad"
                        label="Cards"
                        mode="outlined"
                        onChangeText={(value) => {
                          const nextCount = Number.parseInt(value, 10);
                          onChangeAllocation(worker.userId, Number.isNaN(nextCount) ? 0 : nextCount);
                        }}
                        style={styles.allocationInput}
                        testID={`allocation-input-${worker.userId}`}
                        value={String(allocation?.count ?? 0)}
                      />
                    </Surface>
                  );
                })}
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
  allocationInput: {
    minWidth: 96
  },
  allocationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 12
  },
  allocationSummary: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12
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
