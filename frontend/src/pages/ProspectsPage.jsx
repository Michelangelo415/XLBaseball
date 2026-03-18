import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Layout from '../components/shared/Layout';
import { LoadingSpinner, EmptyState, StatusBadge, PositionBadge, Badge, ConfirmModal } from '../components/shared/ui';
import { getProspects, activateProspect, releaseProspect } from '../utils/api';
import { useAuth } from '../App';

const SLOT_OPTIONS = ['C','1B','2B','SS','3B','INF','OF','UT','DH','SP','RP'];

export default function ProspectsPage() {
  const { user } = useAuth();
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('called_up');
  const [activateTarget, setActivateTarget] = useState(null);
  const [releaseTarget, setReleaseTarget] = useState(null);
  const [activateSlot, setActivateSlot] = useState('OF');
  const isCommissioner = user?.role === 'commissioner';

  const load = useCallback(() => {
    getProspects()
      .then((r) => setProspects(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleActivate = async () => {
    try {
      await activateProspect({ teamId: activateTarget.team_id, playerMlbId: activateTarget.player_mlb_id, slotType: activateSlot });
      toast.success(`${activateTarget.full_name} activated to ${activateSlot}`);
      setActivateTarget(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to activate'); }
  };

  const handleRelease = async () => {
    try {
      await releaseProspect({ teamId: releaseTarget.team_id, playerMlbId: releaseTarget.player_mlb_id });
      toast.success(`${releaseTarget.full_name} released to free agency`);
      setReleaseTarget(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to release'); }
  };

  const filtered = prospects.filter((p) => {
    if (tab === 'called_up') return p.status === 'called_up';
    if (tab === 'prospect') return p.status === 'prospect';
    if (tab === 'history') return ['activated', 'became_fa'].includes(p.status);
    return true;
  });

  const calledUpCount = prospects.filter((p) => p.status === 'called_up').length;

  if (loading) return <Layout title="Prospects"><LoadingSpinner /></Layout>;

  return (
    <Layout
      title="Prospect System"
      subtitle="Rights tracking · Veteran status · Activation decisions"
    >
      {/* Rules reminder */}
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        <strong>Rules:</strong> When a prospect reaches veteran status (active MLB roster), the owning team has 3 days to activate or release. If they pass, the player becomes a free agent. Prospects are no longer eligible once on an MLB roster.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="tabs" style={{ marginBottom: 0, border: 'none' }}>
          <button className={`tab${tab === 'called_up' ? ' active' : ''}`} onClick={() => setTab('called_up')}>
            Called Up {calledUpCount > 0 && <span style={{ marginLeft: 6, background: 'var(--yellow)', color: '#000', borderRadius: '10px', padding: '1px 6px', fontSize: '0.6rem', fontWeight: 700 }}>{calledUpCount}</span>}
          </button>
          <button className={`tab${tab === 'prospect' ? ' active' : ''}`} onClick={() => setTab('prospect')}>
            Prospects
          </button>
          <button className={`tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
            History
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🌱"
          text={tab === 'called_up' ? 'No prospects pending activation decisions' : 'No prospect data'}
        />
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Fantasy Team</th>
                <th>MLB Team</th>
                <th>Position</th>
                <th>Status</th>
                <th>Acquired</th>
                {tab === 'called_up' && <th>Decision Deadline</th>}
                {isCommissioner && tab !== 'history' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const deadlinePassed = p.decision_deadline && new Date(p.decision_deadline) < new Date();
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.full_name}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.fantasy_team_name}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{p.mlb_team || '—'}</td>
                    <td><PositionBadge position={p.primary_position || '?'} /></td>
                    <td><StatusBadge status={p.status} /></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {p.acquired_date ? format(new Date(p.acquired_date), 'MM/dd/yy') : '—'}
                    </td>
                    {tab === 'called_up' && (
                      <td>
                        {p.decision_deadline ? (
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                            color: deadlinePassed ? 'var(--red)' : 'var(--yellow)',
                            fontWeight: deadlinePassed ? 700 : 400,
                          }}>
                            {deadlinePassed ? '⚠ EXPIRED' : format(new Date(p.decision_deadline), 'MM/dd/yy')}
                          </span>
                        ) : '—'}
                      </td>
                    )}
                    {isCommissioner && tab !== 'history' && (
                      <td>
                        {p.status === 'called_up' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-success btn-sm" onClick={() => setActivateTarget(p)}>
                              Activate
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => setReleaseTarget(p)}>
                              Release to FA
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Activate Modal */}
      {activateTarget && (
        <div className="modal-overlay" onClick={() => setActivateTarget(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Activate Prospect</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setActivateTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Activating <strong style={{ color: 'var(--text-primary)' }}>{activateTarget.full_name}</strong> to the active roster for <strong style={{ color: 'var(--text-primary)' }}>{activateTarget.fantasy_team_name}</strong>.
              </p>
              <div className="form-group">
                <label className="form-label">Roster Slot</label>
                <select className="select" value={activateSlot} onChange={(e) => setActivateSlot(e.target.value)}>
                  {SLOT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setActivateTarget(null)}>Cancel</button>
              <button className="btn btn-success" onClick={handleActivate}>Activate Player</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!releaseTarget}
        title="Release to Free Agency"
        message={`Release ${releaseTarget?.full_name} to free agency? ${releaseTarget?.fantasy_team_name} will lose all rights to this player.`}
        onConfirm={handleRelease}
        onCancel={() => setReleaseTarget(null)}
        danger
      />
    </Layout>
  );
}
