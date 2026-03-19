import React, { useState, useCallback } from 'react';
import { format } from 'date-fns';
import Layout from '../components/shared/Layout';
import { LoadingSpinner, EmptyState, PositionBadge, Badge } from '../components/shared/ui';
import { searchPlayers, getPlayer, getPlayerStats } from '../utils/api';

export default function PlayerSearchPage() {
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('');
  const [available, setAvailable] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [playerStats, setPlayerStats] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const doSearch = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setHasSearched(true);
    try {
      const params = {};
      if (query) params.q = query;
      if (position) params.position = position;
      if (available) params.available = 'true';
      const r = await searchPlayers(params);
      setResults(r.data);
    } finally { setLoading(false); }
  };

  const viewPlayer = async (player) => {
    setSelected(player);
    setLoadingDetail(true);
    try {
      const [detail, stats] = await Promise.all([
        getPlayer(player.mlb_id),
        getPlayerStats(player.mlb_id, 2026),
      ]);
      setPlayerDetail(detail.data);
      setPlayerStats(stats.data);
    } finally { setLoadingDetail(false); }
  };

  const batting = playerStats.find((s) => s.stat_type === 'batting');
  const pitching = playerStats.find((s) => s.stat_type === 'pitching');

  return (
    <Layout title="Player Search" subtitle="Search MLB players · View stats · Check availability">
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 20 }}>
        {/* Search Panel */}
        <div>
          <form onSubmit={doSearch}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by player name..."
                style={{ flex: 1 }}
              />
              <select className="select" value={position} onChange={(e) => setPosition(e.target.value)} style={{ width: 120 }}>
                <option value="">All Positions</option>
                {['SP','RP','C','1B','2B','SS','3B','OF','DH'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={available}
                  onChange={(e) => setAvailable(e.target.checked)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                Free agents only
              </label>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? '...' : 'Search'}
              </button>
            </div>
          </form>

          {loading ? (
            <LoadingSpinner text="Searching..." />
          ) : !hasSearched ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: '0.85rem' }}>Search for any MLB player by name or position</div>
            </div>
          ) : results.length === 0 ? (
            <EmptyState icon="👤" text="No players found — try a different search" />
          ) : (
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>MLB Team</th>
                    <th>Pos</th>
                    <th>Fantasy Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((p) => (
                    <tr
                      key={p.mlb_id}
                      style={{ cursor: 'pointer', background: selected?.mlb_id === p.mlb_id ? 'var(--accent-glow)' : undefined }}
                      onClick={() => viewPlayer(p)}
                    >
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.full_name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ID: {p.mlb_id}</div>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{p.mlb_team || '—'}</td>
                      <td><PositionBadge position={p.primary_position} /></td>
                      <td>
                        {p.fantasy_team_name
                          ? <Badge label={p.fantasy_team_name} type="blue" />
                          : <Badge label="Free Agent" type="green" />}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--accent)' }}>View →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Player Detail Panel */}
        {selected && (
          <div>
            <div className="card" style={{ position: 'sticky', top: 80 }}>
              <div className="card-header" style={{ justifyContent: 'space-between' }}>
                <div className="card-title">Player Detail</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
              </div>
              {loadingDetail ? (
                <div style={{ padding: '32px' }}><LoadingSpinner /></div>
              ) : (
                <div className="card-body">
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      {selected.full_name}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <PositionBadge position={selected.primary_position} />
                      {selected.mlb_team && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{selected.mlb_team}</span>
                      )}
                      {selected.fantasy_team_name
                        ? <Badge label={`🔒 ${selected.fantasy_team_name}`} type="blue" />
                        : <Badge label="Free Agent" type="green" />}
                      {selected.is_prospect && <Badge label="Prospect" type="yellow" />}
                    </div>
                  </div>

                  {/* 2026 Stats */}
                  {(batting || pitching) && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                        2026 Fantasy Stats
                      </div>

                      {batting && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>BATTING</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            {[
                              ['FP', parseFloat(batting.total_fantasy_points).toFixed(1)],
                              ['G', batting.games_played],
                              ['HR', batting.home_runs],
                              ['RBI', batting.rbi],
                              ['SB', batting.stolen_bases],
                            ].map(([label, val]) => (
                              <div key={label} style={{ textAlign: 'center', padding: '6px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.88rem' }}>{val}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>{label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {pitching && (
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>PITCHING</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            {[
                              ['FP', parseFloat(pitching.total_fantasy_points).toFixed(1)],
                              ['G', pitching.games_played],
                              ['K', pitching.strikeouts],
                              ['SV', pitching.saves],
                              ['OUT', pitching.outs_recorded],
                            ].map(([label, val]) => (
                              <div key={label} style={{ textAlign: 'center', padding: '6px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.88rem' }}>{val}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>{label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Position eligibility */}
                  {selected.games_by_position && Object.keys(selected.games_by_position).length > 0 && (
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                        Position Eligibility (last 3 yrs)
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {Object.entries(selected.games_by_position).map(([pos, games]) => (
                          <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <PositionBadge position={pos} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: games >= 5 ? 'var(--green)' : 'var(--text-muted)' }}>
                              {games}g {games >= 5 ? '✓' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 6 }}>5+ games = eligible</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
