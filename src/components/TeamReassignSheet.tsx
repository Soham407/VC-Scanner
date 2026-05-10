import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { forwardRef, useMemo, type ForwardedRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Surface, Text } from '../design/openDesign';

import type { TeamInboxItem } from '../lib/teamInbox';
import type { TeamMember } from '../lib/teamMembers';
import { useAppTheme } from '../theme/materialTheme';

type TeamReassignSheetProps = {
  assignmentItem: TeamInboxItem | null;
  isLoading: boolean;
  members: TeamMember[];
  onReassign: (scannedLeadId: string, targetUserId: string) => void;
};

function TeamReassignSheetImpl(
  {
    assignmentItem,
    isLoading,
    members,
    onReassign
  }: TeamReassignSheetProps,
  ref: ForwardedRef<BottomSheetModal>
) {
  const snapPoints = useMemo(() => ['52%', '86%'], []);
  const theme = useAppTheme();
  const workers = members.filter((member) => !member.isLeader);

  return (
    <BottomSheetModal ref={ref} snapPoints={snapPoints}>
      <BottomSheetView style={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <Surface elevation={0} style={[styles.headerCard, { backgroundColor: theme.colors.surfaceContainerHigh }]}>
          <View style={styles.headerCopy}>
            <Text style={styles.title} variant="titleLarge">
              Reassign card
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
              Move this card to another team member.
            </Text>
          </View>
          {assignmentItem ? (
            <View style={styles.headerMeta}>
              <Chip compact style={styles.assignmentChip}>
                {assignmentItem.fullName ?? assignmentItem.companyName ?? assignmentItem.id}
              </Chip>
              {assignmentItem.assignedToUserId ? (
                <Chip compact mode="outlined" style={styles.assignmentChip}>
                  Current owner
                </Chip>
              ) : null}
            </View>
          ) : null}
        </Surface>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {assignmentItem ? (
            <View style={styles.section}>
              <Text variant="titleMedium">Choose a member</Text>
              {workers.length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }} variant="bodyMedium">
                  No team members are available for reassignment.
                </Text>
              ) : (
                <View style={styles.list}>
                  {workers.map((member) => {
                    const isCurrentAssignee = member.userId === assignmentItem.assignedToUserId;
                    return (
                      <Surface
                        key={member.userId}
                        elevation={0}
                        style={[styles.row, { backgroundColor: theme.colors.surfaceContainerHighest }]}
                      >
                        <View style={styles.rowCopy}>
                          <Text variant="titleSmall">{member.email}</Text>
                          <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodySmall">
                            {member.isLeader ? 'Team lead' : 'Team member'}
                            {isCurrentAssignee ? ' · Current owner' : ''}
                          </Text>
                        </View>
                        <Button
                          compact
                          disabled={isLoading || isCurrentAssignee}
                          mode={isCurrentAssignee ? 'outlined' : 'contained'}
                          onPress={() => onReassign(assignmentItem.id, member.userId)}
                          testID={`reassign-${assignmentItem.id}-${member.userId}`}
                        >
                          {isCurrentAssignee ? 'Current' : 'Assign'}
                        </Button>
                      </Surface>
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
            <Text style={{ color: theme.colors.onSurfaceVariant }} variant="bodyMedium">
              Select a card to reassign it.
            </Text>
          )}
        </ScrollView>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

export const TeamReassignSheet = forwardRef(TeamReassignSheetImpl);

const styles = StyleSheet.create({
  assignmentChip: {
    alignSelf: 'flex-start'
  },
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
  title: {
    marginBottom: 8
  }
});
