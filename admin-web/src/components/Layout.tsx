import { Link, NavLink } from 'react-router-dom';
import { BriefcaseBusiness, Inbox, LogOut, LucideIcon, MailPlus, Settings2, UserRound, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { useAuth } from '../lib/auth';

type NavItem = {
  icon: LucideIcon;
  label: string;
  to: string;
};

type NavGroup = {
  items: NavItem[];
  label: string;
};

export function Layout({
  canManageTeam,
  children,
  hasTeam,
  teamName
}: {
  canManageTeam: boolean;
  children: ReactNode;
  hasTeam: boolean;
  teamName: string | null;
}) {
  const { user, signOut } = useAuth();
  const navGroups: NavGroup[] = [
    {
      label: 'Workspace',
      items: [
        { icon: UserRound, label: 'My Leads', to: '/my-leads' },
        ...(hasTeam ? [{ icon: BriefcaseBusiness, label: 'Assigned', to: '/assigned' }] : [])
      ]
    },
    ...(canManageTeam
      ? [
          {
            label: 'Team Leader',
            items: [
              { icon: Inbox, label: 'Team Inbox', to: '/inbox' },
              { icon: Settings2, label: 'Assign', to: '/assign' },
              { icon: Users, label: 'Members', to: '/members' },
              { icon: MailPlus, label: 'Invites', to: '/invites' }
            ]
          }
        ]
      : [])
  ];
  const workspaceLabel = canManageTeam ? 'Team Leader' : hasTeam ? 'Worker' : 'Personal';
  const userInitial = user?.email?.trim()[0]?.toUpperCase() ?? 'U';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/teams" className="brand">
          <span className="brand-mark">VS</span>
          <span>
            <strong>Scanner</strong>
            <small>Admin web</small>
          </span>
        </Link>

        <div className="workspace-card">
          <span className="user-avatar">{userInitial}</span>
          <div>
            <span className="user-label">{workspaceLabel}</span>
            <strong>{teamName ?? 'Personal workspace'}</strong>
          </div>
        </div>

        <nav className="nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <span className="user-avatar small">{userInitial}</span>
            <div>
              <span className="user-label">Signed in</span>
            <strong>{user?.email ?? 'Unknown account'}</strong>
            </div>
          </div>
          <button className="ghost-button" onClick={() => void signOut()}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">{canManageTeam ? 'Team operations' : hasTeam ? 'Assigned work' : 'Personal workspace'}</div>
            <h1>{teamName ?? 'VS Scanner'}</h1>
          </div>
          <div className="topbar-actions">
            <span className="role-pill">{workspaceLabel}</span>
            <Link className="ghost-button" to="/teams">Team settings</Link>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
