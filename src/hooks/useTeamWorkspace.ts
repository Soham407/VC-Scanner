import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  addTeamAssignmentBatchItem,
  approveTeamAssignmentBatch,
  createTeamAssignmentBatch,
  loadPendingTeamAssignmentBatch,
  reassignTeamAssignment,
  removeTeamAssignmentBatchItem,
  type AssignmentState,
  type PendingTeamAssignmentBatch
} from '../lib/teamAssignments';
import { getActiveTeamId, setActiveTeamId } from '../lib/teamContext';
import { createTeam, loadAccessibleTeams, type AccessibleTeam } from '../lib/teams';
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

export type TeamWorkspaceState = {
  activeTeamId: string | null;
  activeTeamName: string | null;
  teams: AccessibleTeam[];
  createTeam: (teamName: string) => Promise<void>;
  createBatch: () => void;
  createInvite: (invitedEmail: string) => Promise<void>;
  historyActiveTeamId: string | null;
  historyTeamName: string | null;
  historyItems: TeamInboxItem[];
  historyMode: TeamInboxReview['mode'];
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
  pendingInvite: PendingTeamInvite | null;
  teamPendingInvites: TeamPendingInvite[];
  approveBatch: () => void;
  addBatchItem: (scannedLeadId: string) => Promise<void>;
  removeBatchItem: (scannedLeadId: string) => Promise<void>;
  promoteMember: (userId: string) => Promise<void>;
  updateAssignmentState: (scannedLeadId: string, assignmentState: AssignmentState) => Promise<void>;
  reassignAssignment: (scannedLeadId: string, targetUserId: string) => Promise<void>;
  respondToInvite: (decision: 'accept' | 'decline') => Promise<void>;
  selectTeam: (teamId: string) => void;
};

function resetWorkspaceState(
  setTeams: (teams: AccessibleTeam[]) => void,
  setActiveTeamIdState: (teamId: string | null) => void,
  setHistoryMode: (mode: TeamInboxReview['mode']) => void,
  setHistoryItems: (items: TeamInboxItem[]) => void,
  setHistoryTeamName: (name: string | null) => void,
  setHistoryActiveTeamId: (teamId: string | null) => void,
  setPendingBatchId: (batchId: string | null) => void,
  setPendingBatchItems: (items: PendingTeamAssignmentBatch['items']) => void,
  setPendingBatchScanCount: (scanCount: number) => void,
  setIsBatchActionLoading: (loading: boolean) => void,
  setIsAssignmentReassignmentLoading: (loading: boolean) => void,
  setPendingInvites: (invites: PendingTeamInvite[]) => void,
  setTeamPendingInvites: (invites: TeamPendingInvite[]) => void,
  setMembers: (members: TeamMember[]) => void,
  setIsTeamMembersLoading: (loading: boolean) => void,
  setIsInviteGateReady: (ready: boolean) => void
): void {
  setTeams([]);
  setActiveTeamIdState(null);
  setHistoryMode('worker-history');
  setHistoryItems([]);
  setHistoryTeamName(null);
  setHistoryActiveTeamId(null);
  setPendingBatchId(null);
  setPendingBatchItems([]);
  setPendingBatchScanCount(0);
  setIsBatchActionLoading(false);
  setIsAssignmentReassignmentLoading(false);
  setPendingInvites([]);
  setTeamPendingInvites([]);
  setMembers([]);
  setIsTeamMembersLoading(false);
  setIsInviteGateReady(false);
}

export function useTeamWorkspace(session: Session | null | undefined): TeamWorkspaceState {
  const [teams, setTeams] = useState<AccessibleTeam[]>([]);
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null);
  const [isTeamsLoading, setIsTeamsLoading] = useState(false);
  const [isTeamCreationLoading, setIsTeamCreationLoading] = useState(false);
  const [isTeamMembersLoading, setIsTeamMembersLoading] = useState(false);
  const [historyMode, setHistoryMode] = useState<TeamInboxReview['mode']>('worker-history');
  const [historyItems, setHistoryItems] = useState<TeamInboxItem[]>([]);
  const [historyTeamName, setHistoryTeamName] = useState<string | null>(null);
  const [historyActiveTeamId, setHistoryActiveTeamId] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const [pendingBatchItems, setPendingBatchItems] = useState<PendingTeamAssignmentBatch['items']>([]);
  const [pendingBatchScanCount, setPendingBatchScanCount] = useState<number>(0);
  const [isBatchActionLoading, setIsBatchActionLoading] = useState(false);
  const [isAssignmentReassignmentLoading, setIsAssignmentReassignmentLoading] = useState(false);
  const [isInviteCreationLoading, setIsInviteCreationLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingTeamInvite[]>([]);
  const [teamPendingInvites, setTeamPendingInvites] = useState<TeamPendingInvite[]>([]);
  const [isInviteGateReady, setIsInviteGateReady] = useState(false);
  const [isInviteDecisionSubmitting, setIsInviteDecisionSubmitting] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);

  const refreshTeamSelection = useCallback(async (): Promise<void> => {
    setIsTeamsLoading(true);

    try {
      const [nextTeams, nextActiveTeamId] = await Promise.all([
        loadAccessibleTeams(),
        getActiveTeamId()
      ]);

      setTeams(nextTeams);
      setActiveTeamIdState(nextActiveTeamId);

      if (!nextActiveTeamId && nextTeams.length > 0) {
        const fallbackTeamId = nextTeams[0].id;
        await setActiveTeamId(fallbackTeamId);
        setActiveTeamIdState(fallbackTeamId);
      }
    } catch (error) {
      console.warn('Team directory load failed', error);
      setTeams([]);
      setActiveTeamIdState(null);
    } finally {
      setIsTeamsLoading(false);
    }
  }, []);

  const refreshHistory = useCallback(async (): Promise<void> => {
    if (!session?.user.id) {
      setHistoryMode('worker-history');
      setHistoryTeamName(null);
      setHistoryItems([]);
      setHistoryActiveTeamId(null);
      return;
    }

    setIsHistoryLoading(true);

    try {
      const result = await loadTeamInboxReview(session.user.id);
      setHistoryMode(result.mode);
      setHistoryTeamName(result.teamName);
      setHistoryItems(result.items);
      setHistoryActiveTeamId(result.activeTeamId);
    } catch (error) {
      setHistoryMode('worker-history');
      setHistoryTeamName(null);
      setHistoryItems([]);
      setHistoryActiveTeamId(null);
      console.warn('Team inbox review fetch failed', error);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [session?.user.id]);

  const refreshMembers = useCallback(async (): Promise<void> => {
    if (!activeTeamId) {
      setMembers([]);
      setIsTeamMembersLoading(false);
      return;
    }

    setIsTeamMembersLoading(true);

    try {
      const nextMembers = await loadTeamMembers(activeTeamId);
      setMembers(nextMembers);
    } catch (error) {
      console.warn('Team members load failed', error);
      setMembers([]);
    } finally {
      setIsTeamMembersLoading(false);
    }
  }, [activeTeamId]);

  const refreshPendingBatch = useCallback(async (): Promise<void> => {
    if (historyMode !== 'leader-inbox' || !historyActiveTeamId) {
      setPendingBatchId(null);
      setPendingBatchItems([]);
      setPendingBatchScanCount(0);
      return;
    }

    try {
      const nextBatch = await loadPendingTeamAssignmentBatch(historyActiveTeamId);
      setPendingBatchId(nextBatch?.batchId ?? null);
      setPendingBatchItems(nextBatch?.items ?? []);
      setPendingBatchScanCount(nextBatch?.scanCount ?? 0);
    } catch (error) {
      console.warn('Team assignment batch load failed', error);
      setPendingBatchId(null);
      setPendingBatchItems([]);
      setPendingBatchScanCount(0);
    }
  }, [historyActiveTeamId, historyMode]);

  useEffect(() => {
    if (!session?.user.id) {
      resetWorkspaceState(
        setTeams,
        setActiveTeamIdState,
        setHistoryMode,
        setHistoryItems,
        setHistoryTeamName,
        setHistoryActiveTeamId,
        setPendingBatchId,
        setPendingBatchItems,
        setPendingBatchScanCount,
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

    void refreshTeamSelection();
  }, [refreshTeamSelection, session?.user.id]);

  useEffect(() => {
    void refreshHistory();
  }, [activeTeamId, refreshHistory]);

  useEffect(() => {
    void refreshPendingBatch();
  }, [refreshPendingBatch]);

  useEffect(() => {
    void refreshMembers();
  }, [activeTeamId, refreshMembers]);

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

  const selectTeam = useCallback(
    (teamId: string) => {
      void (async () => {
        try {
          await setActiveTeamId(teamId);
          setActiveTeamIdState(teamId);
        } catch (error) {
          console.warn('Team switch failed', error);
        }
      })();
    },
    []
  );

  const createBatch = useCallback(() => {
    if (historyMode !== 'leader-inbox' || !historyActiveTeamId || isBatchActionLoading) {
      return;
    }

    setIsBatchActionLoading(true);
    void (async () => {
      try {
        const result = await createTeamAssignmentBatch(historyActiveTeamId);
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
  }, [historyActiveTeamId, historyMode, isBatchActionLoading, refreshPendingBatch]);

  const createInvite = useCallback(
    async (invitedEmail: string): Promise<void> => {
      if (!activeTeamId || isInviteCreationLoading) {
        return;
      }

      setIsInviteCreationLoading(true);

      try {
        await createTeamInvite({
          teamId: activeTeamId,
          invitedEmail
        });
        const nextTeamInvites = await listPendingTeamInvitesForTeam(activeTeamId);
        setTeamPendingInvites(nextTeamInvites);
        await refreshMembers();
      } catch (error) {
        console.warn('Team invite creation failed', error);
        throw error;
      } finally {
        setIsInviteCreationLoading(false);
      }
    },
    [activeTeamId, isInviteCreationLoading, refreshMembers]
  );

  useEffect(() => {
    if (!activeTeamId) {
      setTeamPendingInvites([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const nextTeamInvites = await listPendingTeamInvitesForTeam(activeTeamId);
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
  }, [activeTeamId]);

  const promoteMember = useCallback(
    async (userId: string): Promise<void> => {
      if (!activeTeamId) {
        return;
      }

      await promoteTeamMemberToLeader(activeTeamId, userId);
      await refreshMembers();
    },
    [activeTeamId, refreshMembers]
  );

  const updateAssignment = useCallback(
    async (scannedLeadId: string, assignmentState: AssignmentState): Promise<void> => {
      await updateTeamAssignmentState(scannedLeadId, assignmentState);
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
      if (!historyActiveTeamId || isAssignmentReassignmentLoading) {
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
    [historyActiveTeamId, isAssignmentReassignmentLoading, refreshHistory]
  );

  const createNewTeam = useCallback(
    async (teamName: string): Promise<void> => {
      if (isTeamCreationLoading) {
        return;
      }

      setIsTeamCreationLoading(true);

      try {
        const team = await createTeam(teamName);
        await setActiveTeamId(team.id);
        setActiveTeamIdState(team.id);
        await refreshTeamSelection();
        await refreshHistory();
      } catch (error) {
        console.warn('Team creation failed', error);
        throw error;
      } finally {
        setIsTeamCreationLoading(false);
      }
    },
    [isTeamCreationLoading, refreshTeamSelection, refreshHistory]
  );

  const approveBatch = useCallback(() => {
    if (historyMode !== 'leader-inbox' || !pendingBatchId || isBatchActionLoading) {
      return;
    }

    setIsBatchActionLoading(true);
    void (async () => {
      try {
        await approveTeamAssignmentBatch(pendingBatchId);
        setPendingBatchId(null);
        setPendingBatchItems([]);
        setPendingBatchScanCount(0);
        await refreshHistory();
        await refreshPendingBatch();
      } catch (error) {
        console.warn('Batch approval failed', error);
      } finally {
        setIsBatchActionLoading(false);
      }
    })();
  }, [historyMode, isBatchActionLoading, pendingBatchId, refreshHistory, refreshPendingBatch]);

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
          await setActiveTeamId(activeInvite.teamId);
          setActiveTeamIdState(activeInvite.teamId);
          await refreshTeamSelection();
          await refreshHistory();
        }
      } catch (error) {
        console.warn('Team invite response failed', error);
        throw error;
      } finally {
        setIsInviteDecisionSubmitting(false);
      }
    },
    [isInviteDecisionSubmitting, pendingInvites, refreshTeamSelection, refreshHistory]
  );

  const activeInvite = pendingInvites[0] ?? null;

  return {
    activeTeamId,
    activeTeamName: teams.find((team) => team.id === activeTeamId)?.name ?? null,
    teams,
    createTeam: createNewTeam,
    createInvite,
    approveBatch,
    createBatch,
    historyActiveTeamId,
    historyTeamName,
    historyItems,
    historyMode,
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
    pendingInvite: activeInvite,
    teamPendingInvites,
    addBatchItem,
    removeBatchItem,
    promoteMember,
    respondToInvite,
    updateAssignmentState: updateAssignment,
    reassignAssignment,
    selectTeam
  };
}
