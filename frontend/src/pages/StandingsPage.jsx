import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import Layout from '../components/shared/Layout';
import { LoadingSpinner, EmptyState } from '../components/shared/ui';
import { getStandings } from '../utils/api';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function StandingsPage() {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStandings()
      .then((r) => setStandings(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout title="Standings"><LoadingSpinner text="Loading standings..." /></Layout>;

  return (
    <Layout
      title="Standings"
      subtitle={`2025 Season · Updated ${format(new Date(), 'MMM d, h:mm a')}`}
    >
      {/* Top 3 podium */}
      {standings.length >= 3 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, alignItems: 'flex-end' }}>
          {[standings[1], standings[0], standings[2]].map((row, i) => {
            if (!row) return null;
            const height = i === 1 ? 110 : 80;
            const place = i === 1 ? 1 : i === 0 ? 2 : 3;
            return (
              <Link key={row.team_id} to={`/teams/${row.team_id}`} style={{ flex: 1, textDecoration: 'none' }}>
                <div style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '16px 12px',
                  textAlign: 'center', height,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  transition: 'border-color 0.15s',
                  borderColor: place === 1 ? 'rgba(255,215,0,0.3)' : 'var(--border)',
                }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>{MEDAL[place]}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                    {row.team_name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
                    {parseFloat(row.total_rank_points || 0).toFixed(0)}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>rank pts</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Full Standings</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Tiebreakers: 1) Saves  2) Home Runs  3) SP Points
          </div>
        </div>
        {standings.length === 0 ? (
          <EmptyState icon="🏆" text="No standings data yet — season hasn't started" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>Owner</th>
                <th style={{ textAlign: 'right' }}>Rank Pts</th>
                <th style={{ textAlign: 'right' }}>Fantasy Pts</th>
                <th style={{ textAlign: 'right' }}>SV</th>
                <th style={{ textAlign: 'right' }}>HR</th>
                <th style={{ textAlign: 'right' }}>SP Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.team_id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem' }}
                        className={`rank-${row.current_rank}`}>
                        {row.current_rank}
                      </span>
                      {MEDAL[row.current_rank] && (
                        <span style={{ fontSize: '0.9rem' }}>{MEDAL[row.current_rank]}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <Link to={`/teams/${row.team_id}`} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.88rem' }}>
                      {row.team_name}
                    </Link>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{row.owner_name}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="stat-num">{parseFloat(row.total_rank_points || 0).toFixed(0)}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {parseFloat(row.total_fantasy_points || 0).toFixed(1)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {row.total_saves || 0}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {row.total_home_runs || 0}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {parseFloat(row.total_sp_points || 0).toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Scoring rules reminder */}
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">⚾ Batting Scoring</div></div>
          <div className="card-body">
            {[['Single','1B','1'],['Double','2B','2'],['Triple','3B','3'],['Home Run','HR','4'],
              ['Walk','BB','1'],['HBP','HBP','1'],['RBI','RBI','1'],
              ['Stolen Base','SB','1'],['Caught Stealing','CS','-1'],['GIDP','GIDP','-1']].map(([name, abbr, pts]) => (
              <div key={abbr} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: pts.startsWith('-') ? 'var(--red)' : 'var(--green)' }}>
                  {pts.startsWith('-') ? '' : '+'}{pts}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">⚾ Pitching Scoring</div></div>
          <div className="card-body">
            {[['Out Recorded','OUT','1'],['Strikeout','K','1'],['Save','SV','2'],
              ['Hit Allowed','H','-1'],['Walk Allowed','BB','-1'],['Earned Run','ER','-2']].map(([name, abbr, pts]) => (
              <div key={abbr} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: pts.startsWith('-') ? 'var(--red)' : 'var(--green)' }}>
                  {pts.startsWith('-') ? '' : '+'}{pts}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: '8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              ⚠ Relievers only score if pitching in relief or ≤3 IP
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
