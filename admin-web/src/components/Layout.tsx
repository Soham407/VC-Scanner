import { Link, NavLink } from 'react-router-dom';
import { BriefcaseBusiness, Inbox, LogOut, LucideIcon, MailPlus, Settings2, UserRound, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { useAuth } from '../lib/auth';

type NavItem = {
  icon: LucideIcon;
  label: string;
  to: string;
};

const navItems: NavItem[] = [
  { icon: UserRound, label: 'My Leads', to: '/my-leads' }
];

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
  const visibleNavItems = [
    ...navItems,
    ...(hasTeam ? [{ icon: BriefcaseBusiness, label: 'Assigned', to: '/assigned' }] : []),
    ...(canManageTeam
      ? [
          { icon: Inbox, label: 'Team Inbox', to: '/inbox' },
          { icon: Settings2, label: 'Assign', to: '/assign' },
          { icon: Users, label: 'Members', to: '/members' },
          { icon: MailPlus, label: 'Invites', to: '/invites' }
        ]
      : [])
  ];

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

        <nav className="nav">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <span className="user-label">Signed in</span>
            <strong>{user?.email ?? 'Unknown account'}</strong>
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
        </header>
        {children}
      </main>
    </div>
  );
}
