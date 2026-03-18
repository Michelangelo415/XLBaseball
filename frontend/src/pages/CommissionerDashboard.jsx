import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format, subDays } from 'date-fns';
import Layout from '../components/shared/Layout';
import { LoadingSpinner, StatusBadge, Badge } from '../components/shared/ui';
import {
  getStandings, getActivity, getPendingTrades, getProspects,
  syncPlayers, checkProspects, pullStats, runScoring,
} from '../utils/api';

export default function CommissionerDashboard() {
  const [standings, setStandings] = useState([]);
  const [activity, setActivity] = useState([]);
  const [pendingTrades, setPendingTrades] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  const load = useCallback(async () => {
    try {
      const [s, a, t, p] = await Promise.all([
        getStandings(), getActivity(20), getPendingTrades(), getProspects(),
      ]);
      setStandings(s.data);
      setActivity(a.data);
      setPendingTrades(t.data);
      setProspects(p.data.filter((pr) => pr.status === 'called_up'));
    } catch { toast.error('Failed to load dashboard'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runJob = async (label, fn) => {
    setRunningJob(label);
    try {
      await fn();
      toast.success(`${label} complete`);
      load();
    } catch (err) {
      toast.error(`${label} failed: ${err.response?.data?.error || err.message}`);
    } finally { setRunningJob(null); }
  };

  if (loading) return <Layout title="Dashboard"><LoadingSpinner text="Loading dashboard..." /></Layout>;

  const urgentItems = [
    ...pendingTrades.map((t) => ({ type: 'trade', id: t.id, msg: `Trade: ${t.proposing_team_name} ↔ ${t.receiving_team_name}`, link: '/trades' })),
    ...prospects.map((p) => ({ type: 'prospect', id: p.id, msg: `${p.full_name} reached veteran status — deadline ${p.decision_deadline}`, link: '/prospects' })),
  ];

  return (
    <Layout title="Commissioner Dashboard" subtitle="League control center — 2025 season">
      {/* Urgent Actions */}
      {urgentItems.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--yellow)', marginBottom: 10 }}>
            ⚠ Requires Attention
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {urgentItems.map((item) => (
              <Link key={item.id} to={item.link} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.25)',
                  borderRadius: 'var(--radius)', padding: '10px 14px',
                  fontSize: '0.8rem', color: 'var(--yellow)', display: 'flex',
                  alignItems: 'center', gap: 10, transition: 'background 0.15s',
                }}>
                  <span>{item.type === 'trade' ? '🔄' : '🌱'}</span>
                  <span>{item.msg}</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.6 }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-label">Teams</div>
          <div className="stat-card-value">{standings.length}</div>
          <div className="stat-card-sub">Active this season</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--yellow)' }}>
          <div className="stat-card-label">Pending Trades</div>
          <div className="stat-card-value" style={{ color: pendingTrades.length > 0 ? 'var(--yellow)' : 'var(--text-primary)' }}>
            {pendingTrades.length}
          </div>
          <div className="stat-card-sub">Awaiting review</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--green)' }}>
          <div className="stat-card-label">Prospect Decisions</div>
          <div className="stat-card-value" style={{ color: prospects.length > 0 ? 'var(--yellow)' : 'var(--green)' }}>
            {prospects.length}
          </div>
          <div className="stat-card-sub">Pending activation</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--purple)' }}>
          <div className="stat-card-label">Today</div>
          <div className="stat-card-value" style={{ fontSize: '1.2rem', paddingTop: 4 }}>
            {format(new Date(), 'MMM d')}
          </div>
          <div className="stat-card-sub">{format(new Date(), 'EEEE')}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 20 }}>
        {/* Manual Job Controls */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">⚡ Manual Controls</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Yesterday ({yesterday})
            </div>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
              disabled={!!runningJob}
              onClick={() => runJob('Pull Stats', () => pullStats(yesterday))}
            >
              📥 {runningJob === 'Pull Stats' ? 'Pulling...' : 'Pull MLB Stats'}
            </button>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
              disabled={!!runningJob}
              onClick={() => runJob('Run Scoring', () => runScoring(yesterday))}
            >
              📊 {runningJob === 'Run Scoring' ? 'Scoring...' : 'Run Scoring'}
            </button>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 8, marginBottom: 4 }}>
              Maintenance
            </div>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
              disabled={!!runningJob}
              onClick={() => runJob('Sync Players', syncPlayers)}
            >
              🔄 {runningJob === 'Sync Players' ? 'Syncing...' : 'Sync MLB Rosters'}
            </button>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
              disabled={!!runningJob}
              onClick={() => runJob('Check Prospects', checkProspects)}
            >
              🌱 {runningJob === 'Check Prospects' ? 'Checking...' : 'Check Prospect Status'}
            </button>

            <div style={{ marginTop: 12 }}>
              <Link to="/import">
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  📥 Import Rosters from Google Sheets
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Standings Snapshot */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">🏆 Standings</div>
            <Link to="/standings" style={{ fontSize: '0.72rem', color: 'var(--accent)', textDecoration: 'none' }}>View all →</Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>Rank Pts</th>
                <th>FP</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.team_id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      className={`rank-${row.current_rank}`}>
                      {row.current_rank || i + 1}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.team_name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{row.owner_name}</div>
                  </td>
                  <td><span className="stat-num">{parseFloat(row.total_rank_points || 0).toFixed(0)}</span></td>
                  <td><span className="stat-num" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{parseFloat(row.total_fantasy_points || 0).toFixed(1)}</span></td>
                </tr>
              ))}
              {standings.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No standings yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Recent Activity */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <div className="card-title">📋 Recent Activity</div>
            <Link to="/trades" style={{ fontSize: '0.72rem', color: 'var(--accent)', textDecoration: 'none' }}>Trades →</Link>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {activity.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No activity yet</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Time</th><th>Team</th><th>Action</th><th>Details</th></tr>
                </thead>
                <tbody>
                  {activity.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {format(new Date(item.created_at), 'MM/dd HH:mm')}
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>{item.team_name || '—'}</td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)' }}>
                          {item.action_type}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
