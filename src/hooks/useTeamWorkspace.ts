import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  addTeamAssignmentBatchItem,
  approveTeamAssignmentBatch,
  buildDefaultWorkerAllocations,
  createTeamAssignmentBatch,
  loadPendingTeamAssignmentBatch,
  reassignTeamAssignment,
  removeTeamAssignmentBatchItem,
  type TeamWorkerAllocation,
  type AssignmentState,
  type PendingTeamAssignmentBatch
} from '../lib/teamAssignments';
import { createTeam, loadCurrentTeam, type AccessibleTeam } from '../lib/teams';
import { loadTeamInboxReview, type TeamInboxItem, type TeamInboxReview } from '../lib/teamInbox';
import {
  createTeamInvite,
  listPendingTeamInvitesForEmail,
  listPendingTeamInvitesForTeam,
  respondToTeamInvite,
  type PendingTeamInvite,
  type TeamPendingInvite
} from '../lib/teamInvites';
import { loadTeamMembers, promoteTeamMemberToLeader, type TeamMember } from '../lib/teamMembers';
import { updateTeamAssignmentState } from '../lib/teamAssignments';
import { updateScannedLeadDetails, type ScannedLeadDetailsUpdate } from '../lib/teamReview';

export type TeamWorkspaceState = {
  team: AccessibleTeam | null;
  hasTeamWorkspace: boolean;
  createTeam: (teamName: string) => Promise<void>;
  createBatch: () => void;
  createInvite: (invitedEmail: string) => Promise<void>;
  historyTeamId: string | null;
  historyTeamName: string | null;
  historyItems: TeamInboxItem[];
  historyMode: TeamInboxReview['mode'];
  hasMoreHistory: boolean;
  loadMoreHistory: () => void;
  isLoadingMoreHistory: boolean;
  members: TeamMember[];
  isBatchActionLoading: boolean;
  isAssignmentReassignmentLoading: boolean;
  isTeamCreationLoading: boolean;
  isTeamMembersLoading: boolean;
  isTeamsLoading: boolean;
  isHistoryLoading: boolean;
  isInviteCreationLoading: boolean;
  isInviteDecisionSubmitting: boolean;
  isInviteGateReady: boolean;
  pendingBatchId: string | null;
  pendingBatchItems: PendingTeamAssignmentBatch['items'];
  pendingBatchScanCount: number;
  pendingBatchAllocations: TeamWorkerAllocation[];
  updatePendingBatchAllocation: (userId: string, count: number) => void;
  pendingInvite: PendingTeamInvite | null;
  teamPendingInvites: TeamPendingInvite[];
  approveBatch: (allocations?: TeamWorkerAllocation[]) => Promise<void>;
  addBatchItem: (scannedLeadId: string) => Promise<void>;
  removeBatchItem: (scannedLeadId: string) => Promise<void>;
  promoteMember: (userId: string) => Promise<void>;
  updateLeadDetails: (scannedLeadId: string, updates: ScannedLeadDetailsUpdate) => Promise<void>;
  updateAssignmentState: (scannedLeadId: string, assignmentState: AssignmentState) => Promise<void>;
  reassignAssignment: (scannedLeadId: string, targetUserId: string) => Promise<void>;
  respondToInvite: (decision: 'accept' | 'decline') => Promise<void>;
};

function resetWorkspaceState(
  setTeam: (team: AccessibleTeam | null) => void,
  setHistoryMode: (mode: TeamInboxReview['mode']) => void,
  setHistoryItems: (items: TeamInboxItem[]) => void,
  setHistoryTeamName: (name: string | null) => void,
  setHistoryTeamId: (teamId: string | null) => void,
  setPendingBatchId: (batchId: string | null) => void,
  setPendingBatchItems: (items: PendingTeamAssignmentBatch['items']) => void,
  setPendingBatchScanCount: (scanCount: number) => void,
  setPendingBatchAllocations: (allocations: TeamWorkerAllocation[]) => void,
  setIsBatchActionLoading: (loading: boolean) => void,
  setIsAssignmentReassignmentLoading: (loading: boolean) => void,
  setPendingInvites: (invites: PendingTeamInvite[]) => void,
  setTeamPendingInvites: (invites: TeamPendingInvite[]) => void,
  setMembers: (members: TeamMember[]) => void,
  setIsTeamMembersLoading: (loading: boolean) => void,
  setIsInviteGateReady: (ready: boolean) => void
): void {
  setTeam(null);
  setHistoryMode('worker-history');
  setHistoryItems([]);
  setHistoryTeamName(null);
  setHistoryTeamId(null);
  setPendingBatchId(null);
  setPendingBatchItems([]);
  setPendingBatchScanCount(0);
  setPendingBatchAllocations([]);
  setIsBatchActionLoading(false);
  setIsAssignmentReassignmentLoading(false);
  setPendingInvites([]);
  setTeamPendingInvites([]);
  setMembers([]);
  setIsTeamMembersLoading(false);
  setIsInviteGateReady(false);
}

export function useTeamWorkspace(session: Session | null | undefined): TeamWorkspaceState {
  const [team, setTeam] = useState<AccessibleTeam | null>(null);
  const [isTeamsLoading, setIsTeamsLoading] = useState(false);
  const [isTeamCreationLoading, setIsTeamCreationLoading] = useState(false);
  const [isTeamMembersLoading, setIsTeamMembersLoading] = useState(false);
  const [historyMode, setHistoryMode] = useState<TeamInboxReview['mode']>('worker-history');
  const [historyItems, setHistoryItems] = useState<TeamInboxItem[]>([]);
  const [historyTeamName, setHistoryTeamName] = useState<string | null>(null);
  const [historyTeamId, setHistoryTeamId] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const [pendingBatchItems, setPendingBatchItems] = useState<PendingTeamAssignmentBatch['items']>([]);
  const [pendingBatchScanCount, setPendingBatchScanCount] = useState<number>(0);
  const [pendingBatchAllocations, setPendingBatchAllocations] = useState<TeamWorkerAllocation[]>([]);
  const [isBatchActionLoading, setIsBatchActionLoading] = useState(false);
  const [isAssignmentReassignmentLoading, setIsAssignmentReassignmentLoading] = useState(false);
  const [isInviteCreationLoading, setIsInviteCreationLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingTeamInvite[]>([]);
  const [teamPendingInvites, setTeamPendingInvites] = useState<TeamPendingInvite[]>([]);
  const [isInviteGateReady, setIsInviteGateReady] = useState(false);
  const [isInviteDecisionSubmitting, setIsInviteDecisionSubmitting] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

  const workerMembers = useMemo(() => members.filter((member) => !member.isLeader), [members]);

  const refreshTeam = useCallback(async (): Promise<void> => {
    if (!session?.user.id) {
      setTeam(null);
      setIsTeamsLoading(false);
      return;
    }

    setIsTeamsLoading(true);

    try {
      const nextTeam = await loadCurrentTeam(session.user.id);
      setTeam(nextTeam);
    } catch (error) {
      console.warn('Team lookup failed', error);
      setTeam(null);
    } finally {
      setIsTeamsLoading(false);
    }
  }, [session?.user.id]);

  const refreshHistory = useCallback(async (): Promise<void> => {
    if (!session?.user.id) {
      setHistoryMode('worker-history');
      setHistoryTeamName(null);
      setHistoryItems([]);
      setHistoryTeamId(null);
      setHasMoreHistory(false);
      setHistoryPage(0);
      return;
    }

    setIsHistoryLoading(true);

    try {
      const result = await loadTeamInboxReview(session.user.id, 0);
      setHistoryMode(result.mode);
      setHistoryTeamName(result.teamName);
      setHistoryItems(result.items);
      setHistoryTeamId(result.teamId);
      setHasMoreHistory(result.hasMore);
      setHistoryPage(0);
    } catch (error) {
      setHistoryMode('worker-history');
      setHistoryTeamName(null);
      setHistoryItems([]);
      setHistoryTeamId(null);
      setHasMoreHistory(false);
      setHistoryPage(0);
      console.warn('Team inbox review fetch failed', error);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [session?.user.id]);

  const loadMoreHistory = useCallback(() => {
    if (!session?.user.id || !hasMoreHistory || isLoadingMoreHistory) {
      return;
    }

    const nextPage = historyPage + 1;
    setIsLoadingMoreHistory(true);

    void (async () => {
      try {
        const result = await loadTeamInboxReview(session.user.id, nextPage);
        setHistoryItems((current) => [...current, ...result.items]);
        setHasMoreHistory(result.hasMore);
        setHistoryPage(nextPage);
      } catch (error) {
        console.warn('Load more history failed', error);
      } finally {
        setIsLoadingMoreHistory(false);
      }
    })();
  }, [session?.user.id, hasMoreHistory, historyPage, isLoadingMoreHistory]);

  const refreshMembers = useCallback(async (teamId?: string): Promise<void> => {
    const effectiveTeamId = teamId ?? team?.id;

    if (!effectiveTeamId) {
      setMembers([]);
      setIsTeamMembersLoading(false);
      return;
    }

    setIsTeamMembersLoading(true);

    try {
      const nextMembers = await loadTeamMembers(effectiveTeamId);
      setMembers(nextMembers);
    } catch (error) {
      console.warn('Team members load failed', error);
      setMembers([]);
    } finally {
      setIsTeamMembersLoading(false);
    }
  }, [team]);

  const refreshPendingBatch = useCallback(async (): Promise<void> => {
    if (historyMode !== 'leader-inbox' || !historyTeamId) {
      setPendingBatchId(null);
      setPendingBatchItems([]);
      setPendingBatchScanCount(0);
      return;
    }

    try {
      const nextBatch = await loadPendingTeamAssignmentBatch(historyTeamId);
      setPendingBatchId(nextBatch?.batchId ?? null);
      setPendingBatchItems(nextBatch?.items ?? []);
      setPendingBatchScanCount(nextBatch?.scanCount ?? 0);
    } catch (error) {
      console.warn('Team assignment batch load failed', error);
      setPendingBatchId(null);
      setPendingBatchItems([]);
      setPendingBatchScanCount(0);
    }
  }, [historyTeamId, historyMode]);

  useEffect(() => {
    if (pendingBatchId && workerMembers.length > 0 && pendingBatchScanCount > 0) {
      setPendingBatchAllocations(buildDefaultWorkerAllocations(
        workerMembers.map((member) => ({ userId: member.userId })),
        pendingBatchScanCount
      ));
      return;
    }

    setPendingBatchAllocations([]);
  }, [pendingBatchId, pendingBatchScanCount, workerMembers]);

  const updatePendingBatchAllocation = useCallback((userId: string, count: number) => {
    const normalizedCount = Math.max(0, Math.trunc(count));
    setPendingBatchAllocations((currentAllocations) => {
      const nextAllocations = currentAllocations.map((allocation) =>
        allocation.userId === userId
          ? { ...allocation, count: normalizedCount }
          : allocation
      );

      if (nextAllocations.some((allocation) => allocation.userId === userId)) {
        return nextAllocations;
      }

      return [...nextAllocations, { userId, count: normalizedCount }];
    });
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      resetWorkspaceState(
        setTeam,
        setHistoryMode,
        setHistoryItems,
        setHistoryTeamName,
        setHistoryTeamId,
        setPendingBatchId,
        setPendingBatchItems,
        setPendingBatchScanCount,
        setPendingBatchAllocations,
        setIsBatchActionLoading,
        setIsAssignmentReassignmentLoading,
        setPendingInvites,
        setTeamPendingInvites,
        setMembers,
        setIsTeamMembersLoading,
        setIsInviteGateReady
      );
      return;
    }

    void refreshTeam();
  }, [refreshTeam, session?.user.id]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory, team]);

  useEffect(() => {
    void refreshPendingBatch();
  }, [refreshPendingBatch]);

  useEffect(() => {
    void refreshMembers();
  }, [refreshMembers, team]);

  useEffect(() => {
    if (session === undefined) {
      setIsInviteGateReady(false);
      return;
    }

    if (!session) {
      setPendingInvites([]);
      setIsInviteGateReady(true);
      return;
    }

    let cancelled = false;

    void (async () => {
      setIsInviteGateReady(false);

      try {
        const nextPendingInvites = await listPendingTeamInvitesForEmail(session.user.email);
        if (!cancelled) {
          setPendingInvites(nextPendingInvites);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Team invite lookup failed', error);
          setPendingInvites([]);
        }
      } finally {
        if (!cancelled) {
          setIsInviteGateReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user.email, session?.user.id, session]);

  const createBatch = useCallback(() => {
    if (historyMode !== 'leader-inbox' || !historyTeamId || isBatchActionLoading) {
      return;
    }

    setIsBatchActionLoading(true);
    void (async () => {
      try {
        const result = await createTeamAssignmentBatch(historyTeamId);
        setPendingBatchId(result.batchId);
        setPendingBatchScanCount(result.scanCount);
        setPendingBatchItems([]);
        await refreshPendingBatch();
      } catch (error) {
        console.warn('Batch creation failed', error);
      } finally {
        setIsBatchActionLoading(false);
      }
    })();
  }, [historyTeamId, historyMode, isBatchActionLoading, refreshPendingBatch]);

  const createInvite = useCallback(
    async (invitedEmail: string): Promise<void> => {
      if (!team || isInviteCreationLoading) {
        return;
      }

      setIsInviteCreationLoading(true);

      try {
        await createTeamInvite({
          teamId: team.id,
          invitedEmail
        });
        const nextTeamInvites = await listPendingTeamInvitesForTeam(team.id);
        setTeamPendingInvites(nextTeamInvites);
        await refreshMembers();
      } catch (error) {
        console.warn('Team invite creation failed', error);
        throw error;
      } finally {
        setIsInviteCreationLoading(false);
      }
    },
    [isInviteCreationLoading, refreshMembers, team]
  );

  useEffect(() => {
    if (!team) {
      setTeamPendingInvites([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const nextTeamInvites = await listPendingTeamInvitesForTeam(team.id);
        if (!cancelled) {
          setTeamPendingInvites(nextTeamInvites);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Team pending invites load failed', error);
          setTeamPendingInvites([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [team]);

  const promoteMember = useCallback(
    async (userId: string): Promise<void> => {
      if (!team) {
        return;
      }

      await promoteTeamMemberToLeader(team.id, userId);
      await refreshMembers();
    },
    [refreshMembers, team]
  );

  const updateAssignment = useCallback(
    async (scannedLeadId: string, assignmentState: AssignmentState): Promise<void> => {
      await updateTeamAssignmentState(scannedLeadId, assignmentState);
      await refreshHistory();
    },
    [refreshHistory]
  );

  const updateLead = useCallback(
    async (scannedLeadId: string, updates: ScannedLeadDetailsUpdate): Promise<void> => {
      await updateScannedLeadDetails(scannedLeadId, updates);
      await refreshHistory();
    },
    [refreshHistory]
  );

  const addBatchItem = useCallback(
    async (scannedLeadId: string): Promise<void> => {
      if (!pendingBatchId || isBatchActionLoading) {
        return;
      }

      setIsBatchActionLoading(true);

      try {
        await addTeamAssignmentBatchItem(pendingBatchId, scannedLeadId);
        await refreshPendingBatch();
      } catch (error) {
        console.warn('Batch item add failed', error);
        throw error;
      } finally {
        setIsBatchActionLoading(false);
      }
    },
    [isBatchActionLoading, pendingBatchId, refreshPendingBatch]
  );

  const removeBatchItem = useCallback(
    async (scannedLeadId: string): Promise<void> => {
      if (!pendingBatchId || isBatchActionLoading) {
        return;
      }

      setIsBatchActionLoading(true);

      try {
        await removeTeamAssignmentBatchItem(pendingBatchId, scannedLeadId);
        await refreshPendingBatch();
      } catch (error) {
        console.warn('Batch item remove failed', error);
        throw error;
      } finally {
        setIsBatchActionLoading(false);
      }
    },
    [isBatchActionLoading, pendingBatchId, refreshPendingBatch]
  );

  const reassignAssignment = useCallback(
    async (scannedLeadId: string, targetUserId: string): Promise<void> => {
      if (!historyTeamId || isAssignmentReassignmentLoading) {
        return;
      }

      setIsAssignmentReassignmentLoading(true);

      try {
        await reassignTeamAssignment(scannedLeadId, targetUserId);
        await refreshHistory();
      } catch (error) {
        console.warn('Assignment reassignment failed', error);
        throw error;
      } finally {
        setIsAssignmentReassignmentLoading(false);
      }
    },
    [historyTeamId, isAssignmentReassignmentLoading, refreshHistory]
  );

  const createNewTeam = useCallback(
    async (teamName: string): Promise<void> => {
      if (isTeamCreationLoading) {
        return;
      }

      setIsTeamCreationLoading(true);

      try {
        const createdTeam = await createTeam(teamName);
        setTeam(createdTeam);
        await refreshHistory();
        await refreshMembers(createdTeam.id);
      } catch (error) {
        console.warn('Team creation failed', error);
        throw error;
      } finally {
        setIsTeamCreationLoading(false);
      }
    },
    [isTeamCreationLoading, refreshHistory, refreshMembers]
  );

  const approveBatch = useCallback(
    async (allocations: TeamWorkerAllocation[] = pendingBatchAllocations): Promise<void> => {
      if (historyMode !== 'leader-inbox' || !pendingBatchId || isBatchActionLoading) {
        return;
      }

      setIsBatchActionLoading(true);

      try {
        const result = await approveTeamAssignmentBatch(pendingBatchId, allocations);
        setPendingBatchId(null);
        setPendingBatchItems([]);
        setPendingBatchScanCount(0);
        setPendingBatchAllocations([]);
        await refreshHistory();
        await refreshPendingBatch();
        console.info('Approved team assignment batch', result.assignedCount);
      } catch (error) {
        console.warn('Batch approval failed', error);
        throw error;
      } finally {
        setIsBatchActionLoading(false);
      }
    },
    [historyMode, isBatchActionLoading, pendingBatchAllocations, pendingBatchId, refreshHistory, refreshPendingBatch]
  );

  const respondToInvite = useCallback(
    async (decision: 'accept' | 'decline'): Promise<void> => {
      const activeInvite = pendingInvites[0] ?? null;
      if (!activeInvite || isInviteDecisionSubmitting) {
        return;
      }

      setIsInviteDecisionSubmitting(true);

      try {
        await respondToTeamInvite(activeInvite.id, decision);
        setPendingInvites((currentInvites) => currentInvites.filter((invite) => invite.id !== activeInvite.id));

        if (decision === 'accept') {
          await refreshTeam();
          await refreshHistory();
          await refreshMembers(activeInvite.teamId);
        }
      } catch (error) {
        console.warn('Team invite response failed', error);
        throw error;
      } finally {
        setIsInviteDecisionSubmitting(false);
      }
    },
    [isInviteDecisionSubmitting, pendingInvites, refreshHistory, refreshMembers, refreshTeam]
  );

  const activeInvite = pendingInvites[0] ?? null;

  return {
    team,
    hasTeamWorkspace: Boolean(team),
    createTeam: createNewTeam,
    createInvite,
    approveBatch,
    createBatch,
    historyTeamId,
    historyTeamName,
    historyItems,
    historyMode,
    hasMoreHistory,
    loadMoreHistory,
    isLoadingMoreHistory,
    members,
    isBatchActionLoading,
    isAssignmentReassignmentLoading,
    isTeamCreationLoading,
    isTeamMembersLoading,
    isTeamsLoading,
    isHistoryLoading,
    isInviteCreationLoading,
    isInviteDecisionSubmitting,
    isInviteGateReady,
    pendingBatchId,
    pendingBatchItems,
    pendingBatchScanCount,
    pendingBatchAllocations,
    updatePendingBatchAllocation,
    pendingInvite: activeInvite,
    teamPendingInvites,
    addBatchItem,
    removeBatchItem,
    promoteMember,
    updateLeadDetails: updateLead,
    respondToInvite,
    updateAssignmentState: updateAssignment,
    reassignAssignment
  };
}
