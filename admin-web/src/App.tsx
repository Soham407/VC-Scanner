import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { Layout } from './components/Layout';
import { useAuth } from './lib/auth';
import { getActiveTeamId, getTeamAccess } from './lib/api';
import { useEffect, useState } from 'react';
import type { TeamAccess } from './lib/types';
import { AssignedPage } from './pages/AssignedPage';
import { InboxPage } from './pages/InboxPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { AssignPage } from './pages/AssignPage';
import { InvitesPage } from './pages/InvitesPage';
import { MyLeadsPage } from './pages/MyLeadsPage';
import { TeamSelectorPage } from './pages/TeamSelectorPage';

function AppRouter() {
  const { user } = useAuth();
  const location = useLocation();
  const [teamAccess, setTeamAccess] = useState<TeamAccess>({ canManageTeam: false, teamId: null, teamName: null });
  const [loadingTeam, setLoadingTeam] = useState(true);

  async function refreshWorkspace(nextTeamId?: string | null) {
    if (!user) {
      setTeamAccess({ canManageTeam: false, teamId: null, teamName: null });
      return;
    }
    const activeTeamId = nextTeamId === undefined ? await getActiveTeamId(user.id) : nextTeamId;
    setTeamAccess(await getTeamAccess(activeTeamId, user.id));
  }

  useEffect(() => {
    let active = true;
    if (!user) {
      setTeamAccess({ canManageTeam: false, teamId: null, teamName: null });
      setLoadingTeam(false);
      return;
    }
    setLoadingTeam(true);
    void getActiveTeamId(user.id)
      .then((id) => getTeamAccess(id, user.id))
      .then((access) => {
        if (!active) return;
        setTeamAccess(access);
      })
      .catch(() => {
        if (!active) return;
        setTeamAccess({ canManageTeam: false, teamId: null, teamName: null });
      })
      .finally(() => {
        if (active) setLoadingTeam(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) {
    return <LoginPage />;
  }

  if (loadingTeam) {
    return <div className="loading-screen">Loading workspace...</div>;
  }

  const teamId = teamAccess.teamId;
  const defaultPath = teamAccess.canManageTeam ? '/inbox' : teamId ? '/assigned' : '/my-leads';
  const layout = (children: React.ReactNode) => (
    <Layout canManageTeam={teamAccess.canManageTeam} hasTeam={Boolean(teamId)} teamName={teamAccess.teamName}>
      {children}
    </Layout>
  );

  return (
    <Routes>
      <Route path="/" element={<Navigate to={defaultPath} replace />} />
      <Route path="/teams" element={layout(<TeamSelectorPage activeTeamId={teamId} onTeamSelected={refreshWorkspace} />)} />
      <Route path="/my-leads" element={layout(<MyLeadsPage userId={user.id} />)} />
      <Route path="/assigned" element={teamId ? layout(<AssignedPage teamId={teamId} userId={user.id} />) : <Navigate to="/my-leads" replace />} />
      <Route path="/inbox" element={teamId && teamAccess.canManageTeam ? layout(<InboxPage teamId={teamId} />) : <Navigate to={defaultPath} replace />} />
      <Route path="/assign" element={teamId && teamAccess.canManageTeam ? layout(<AssignPage teamId={teamId} />) : <Navigate to={defaultPath} replace />} />
      <Route path="/members" element={teamId && teamAccess.canManageTeam ? layout(<MembersPage teamId={teamId} />) : <Navigate to={defaultPath} replace />} />
      <Route path="/invites" element={teamId && teamAccess.canManageTeam ? layout(<InvitesPage teamId={teamId} />) : <Navigate to={defaultPath} replace />} />
      <Route path="/leads/:leadId" element={layout(<LeadDetailPage canManageTeam={teamAccess.canManageTeam} teamId={teamId} userId={user.id} />)} />
      <Route path="/auth/callback" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace state={{ from: location.pathname }} />} />
    </Routes>
  );
}

export function App() {
  const { initialized } = useAuth();
  if (!initialized) {
    return <div className="loading-screen">Starting...</div>;
  }
  return <AppRouter />;
}
