import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import Layout from '../components/shared/Layout';
import { LoadingSpinner, PositionBadge, Badge, EmptyState, ConfirmModal } from '../components/shared/ui';
import { getTeam, getTeamRoster, getTeamScores, getTeamLineup, addPlayerToRoster, dropPlayer, convertRPtoSP, searchPlayers } from '../utils/api';
import { useAuth } from '../App';

const SLOT_ORDER = ['SP', 'RP', 'C', '1B', '2B', 'SS', '3B', 'INF', 'OF', 'UT', 'DH', 'PROSPECT'];

export default function TeamDetailPage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [roster, setRoster] = useState([]);
  const [scores, setScores] = useState([]);
  const [lineup, setLineup] = useState([]);
  const [tab, setTab] = useState('roster');
  const [loading, setLoading] = useState(true);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const [convertTarget, setConvertTarget] = useState(null);
  const isCommissioner = user?.role === 'commissioner';

  const today = format(new Date(), 'yyyy-MM-dd');

  const load = useCallback(async () => {
    try {
      const [t, r, s, l] = await Promise.all([
        getTeam(teamId),
        getTeamRoster(teamId),
        getTeamScores(teamId, 20),
        getTeamLineup(teamId, today),
      ]);
      setTeam(t.data);
      setRoster(r.data);
      setScores(s.data);
      setLineup(l.data);
    } catch { toast.error('Failed to load team'); }
    finally { setLoading(false); }
  }, [teamId, today]);

  useEffect(() => { load(); }, [load]);

  const handleDrop = async () => {
    try {
      await dropPlayer({ teamId, playerMlbId: dropTarget.mlb_id });
      toast.success(`${dropTarget.full_name} dropped`);
      setDropTarget(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to drop player'); }
  };

  const handleConvertRP = async () => {
    try {
      await convertRPtoSP({ teamId, playerMlbId: convertTarget.mlb_id });
      toast.success(`${convertTarget.full_name} converted to SP`);
      setConvertTarget(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to convert'); }
  };

  // Group roster by slot type
  const rosterBySlot = SLOT_ORDER.reduce((acc, slot) => {
    acc[slot] = roster.filter((p) => p.slot_type === slot);
    return acc;
  }, {});

  if (loading || !team) return <Layout title="Team"><LoadingSpinner /></Layout>;

  return (
    <Layout
      title={team.name}
      subtitle={`Owner: ${team.owner_name} · ${team.abbreviation}`}
    >
      {/* Header stats */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-label">Fantasy Points</div>
          <div className="stat-card-value">{parseFloat(team.total_fantasy_points || 0).toFixed(1)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Roster Size</div>
          <div className="stat-card-value">{roster.filter((p) => p.slot_type !== 'PROSPECT').length}</div>
          <div className="stat-card-sub">+ {roster.filter((p) => p.slot_type === 'PROSPECT').length} prospects</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Today's Lineup</div>
          <div className="stat-card-value">{lineup.length}</div>
          <div className="stat-card-sub">slots active</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Recent Rank</div>
          <div className="stat-card-value">
            {scores[0]?.rank ? `#${scores[0].rank}` : '—'}
          </div>
          <div className="stat-card-sub">{scores[0]?.score_date || 'No games yet'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {['roster', 'lineup', 'scores'].map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'roster' ? '📋 Roster' : t === 'lineup' ? '⚾ Today\'s Lineup' : '📊 Score History'}
          </button>
        ))}
      </div>

      {/* Roster Tab */}
      {tab === 'roster' && (
        <div>
          {isCommissioner && (
            <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={() => setShowAddPlayer(true)}>+ Add Player</button>
            </div>
          )}
          {SLOT_ORDER.map((slot) => {
            const players = rosterBySlot[slot];
            if (players.length === 0) return null;
            return (
              <div key={slot} style={{ marginBottom: 20 }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.15em',
                  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
                  paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <PositionBadge position={slot} />
                  {slot === 'SP' ? 'Starting Pitchers (5)' :
                   slot === 'RP' ? 'Relief Pitchers (7)' :
                   slot === 'PROSPECT' ? 'Prospects' : slot}
                </div>
                <div className="card">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>MLB Team</th>
                        <th>Pos</th>
                        <th>Level</th>
                        <th>Status</th>
                        {slot === 'RP' && <th>Starts</th>}
                        {isCommissioner && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((p) => (
                        <tr key={p.player_id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.full_name}</div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{p.mlb_team || '—'}</td>
                          <td><PositionBadge position={p.primary_position} /></td>
                          <td>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                              color: p.roster_level === 'MLB1' ? 'var(--green)' : p.roster_level === 'MLB2' ? 'var(--accent)' : 'var(--yellow)',
                            }}>
                              {p.roster_level}
                            </span>
                          </td>
                          <td>
                            {p.status === 'injured'
                              ? <Badge label="IL" type="red" />
                              : p.is_prospect
                              ? <Badge label="Prospect" type="yellow" />
                              : <Badge label="Active" type="green" />}
                          </td>
                          {slot === 'RP' && (
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                              {p.rp_starts || 0}/5
                              {p.rp_converted_to_sp && <Badge label="→SP" type="blue" />}
                            </td>
                          )}
                          {isCommissioner && (
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {slot === 'RP' && !p.rp_converted_to_sp && (
                                  <button className="btn btn-ghost btn-sm" onClick={() => setConvertTarget(p)}>
                                    →SP
                                  </button>
                                )}
                                <button className="btn btn-danger btn-sm" onClick={() => setDropTarget(p)}>
                                  Drop
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lineup Tab */}
      {tab === 'lineup' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Today's Lineup — {today}</div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Auto-selected · MLB1 priority
            </span>
          </div>
          {lineup.length === 0 ? (
            <EmptyState icon="⚾" text="No lineup built yet for today" />
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Slot</th><th>Player</th><th>Pos</th><th>Type</th></tr>
              </thead>
              <tbody>
                {lineup.map((slot) => (
                  <tr key={`${slot.slot_type}-${slot.slot_number}`}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <PositionBadge position={slot.slot_type} />
                        {slot.slot_number > 1 && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                            {slot.slot_number}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: 500 }}>{slot.full_name}</td>
                    <td><PositionBadge position={slot.primary_position} /></td>
                    <td>
                      {slot.is_mlb2_replacement
                        ? <Badge label="MLB2 Fill" type="yellow" />
                        : slot.is_free_agent_fill
                        ? <Badge label="FA Fill" type="red" />
                        : <Badge label="MLB1" type="green" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Scores Tab */}
      {tab === 'scores' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Score History</div>
          </div>
          {scores.length === 0 ? (
            <EmptyState icon="📊" text="No scores recorded yet" />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Rank</th>
                  <th style={{ textAlign: 'right' }}>Rank Pts</th>
                  <th style={{ textAlign: 'right' }}>Fantasy Pts</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{s.score_date}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`stat-num rank-${s.rank}`}>#{s.rank}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="stat-num">{s.rank_points}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {parseFloat(s.fantasy_points).toFixed(1)}
                      </span>
                    </td>
                    <td>
                      {s.is_combined_day && <Badge label="Combined Day" type="yellow" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add Player Modal */}
      {showAddPlayer && (
        <AddPlayerModal
          teamId={teamId}
          onClose={() => setShowAddPlayer(false)}
          onAdded={() => { setShowAddPlayer(false); load(); }}
        />
      )}

      <ConfirmModal
        isOpen={!!dropTarget}
        title="Drop Player"
        message={`Drop ${dropTarget?.full_name} from the roster? This cannot be undone.`}
        onConfirm={handleDrop}
        onCancel={() => setDropTarget(null)}
        danger
      />

      <ConfirmModal
        isOpen={!!convertTarget}
        title="Convert RP to SP"
        message={`Convert ${convertTarget?.full_name} from RP to SP? Note: after 5 starts, this conversion is mandatory.`}
        onConfirm={handleConvertRP}
        onCancel={() => setConvertTarget(null)}
      />
    </Layout>
  );
}

function AddPlayerModal({ teamId, onClose, onAdded }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [slotType, setSlotType] = useState('SP');
  const [rosterLevel, setRosterLevel] = useState('MLB1');
  const [saving, setSaving] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await searchPlayers({ q: query });
      setResults(r.data);
    } finally { setSearching(false); }
  };

  const handleAdd = async () => {
    if (!selected) return toast.error('Select a player');
    setSaving(true);
    try {
      await addPlayerToRoster({ teamId, playerMlbId: selected.mlb_id, slotType, rosterLevel });
      toast.success(`${selected.full_name} added to roster`);
      onAdded();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add player');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Add Player</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="input"
              placeholder="Search player name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={doSearch} disabled={searching}>
              {searching ? '...' : 'Search'}
            </button>
          </div>

          {results.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              {results.map((p) => (
                <div
                  key={p.mlb_id}
                  onClick={() => { setSelected(p); setSlotType(p.primary_position === 'SP' ? 'SP' : p.primary_position === 'RP' ? 'RP' : 'OF'); }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: 10, fontSize: '0.82rem',
                    background: selected?.mlb_id === p.mlb_id ? 'var(--accent-glow)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.1s',
                  }}
                >
                  <PositionBadge position={p.primary_position} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{p.full_name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {p.mlb_team} {p.fantasy_team_name ? `· 🔒 ${p.fantasy_team_name}` : '· Free Agent'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selected && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '12px', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 8 }}>Selected Player</div>
              <div style={{ fontWeight: 600 }}>{selected.full_name}</div>
            </div>
          )}

          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Roster Slot</label>
              <select className="select" value={slotType} onChange={(e) => setSlotType(e.target.value)}>
                {['SP','RP','C','1B','2B','SS','3B','INF','OF','UT','DH','PROSPECT'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Roster Level</label>
              <select className="select" value={rosterLevel} onChange={(e) => setRosterLevel(e.target.value)}>
                <option value="MLB1">MLB1</option>
                <option value="MLB2">MLB2</option>
                <option value="PROSPECT">Prospect</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={!selected || saving}>
            {saving ? 'Adding...' : 'Add to Roster'}
          </button>
        </div>
      </div>
    </div>
  );
}
