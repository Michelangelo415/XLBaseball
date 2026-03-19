import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../App';

const NAV = [
  { section: 'League', links: [
    { to: '/standings', icon: '🏆', label: 'Standings' },
    { to: '/scoring',   icon: '📊', label: 'Scoring' },
    { to: '/players',   icon: '🔍', label: 'Player Search' },
  ]},
  { section: 'Management', links: [
    { to: '/teams',     icon: '👥', label: 'Teams & Rosters' },
    { to: '/trades',    icon: '🔄', label: 'Trades' },
    { to: '/prospects', icon: '🌱', label: 'Prospects' },
  ]},
  { section: 'Commissioner', commissioner: true, links: [
    { to: '/dashboard', icon: '⚡', label: 'Dashboard' },
    { to: '/import',    icon: '📥', label: 'Import Rosters' },
  ]},
];

export default function Layout({ children, title, subtitle, actions }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="league-name">XL<br />Baseball</div>
          <div className="season-badge">⚾ Season 2026</div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((section) => {
            if (section.commissioner && user?.role !== 'commissioner') return null;
            return (
              <div key={section.section}>
                <div className="nav-section-label">{section.section}</div>
                {section.links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  >
                    <span className="nav-icon">{link.icon}</span>
                    {link.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className="main-content">
        {(title || subtitle) && (
          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                {title && <div className="page-title">{title}</div>}
                {subtitle && <div className="page-subtitle">{subtitle}</div>}
                {!subtitle && <div style={{ paddingBottom: 16 }} />}
              </div>
              {actions && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 6, paddingBottom: 16, flexShrink: 0 }}>
                  {actions}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="page-body">{children}</div>
      </main>
    </div>
  );
}
