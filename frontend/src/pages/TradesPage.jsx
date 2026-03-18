import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Layout from '../components/shared/Layout';
import { LoadingSpinner, EmptyState, StatusBadge, PositionBadge, Badge } from '../components/shared/ui';
import { getTrades, getPendingTrades, proposeTrade, acceptTrade, approveTrade, rejectTrade, getTeams, getTeamRoster } from '../utils/api';
import { useAuth } from '../App';

export default function TradesPage() {
  const { user } = useAuth();
  const [trades, setTrades] = useState([]);
  const [pendingTrades, setPendingTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    try {
      const [all, pending] = await Promise.all([getTrades(), getPendingTrades()]);
      setTrades(all.data);
      setPendingTrades(pending.data);
    } catch { toast.error('Failed to load trades'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (tradeId) => {
    try {
      await approveTrade(tradeId);
      toast.success('Trade approved and executed');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to approve'); }
  };

  const handleReject = async (tradeId) => {
    try {
      await rejectTrade(tradeId, 'Rejected by commissioner');
      toast.success('Trade rejected');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to reject'); }
  };

  const allTrades = tab === 'pending' ? pendingTrades : trades.filter((t) => t.status === tab);

  if (loading) return <Layout title="Trades"><LoadingSpinner /></Layout>;

  return (
    <Layout
      title="Trades"
      subtitle={`${pendingTrades.length} pending review · Trade deadline: Aug 15, 2025`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="tabs" style={{ marginBottom: 0, border: 'none' }}>
          {['pending', 'accepted', 'rejected'].map((t) => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'pending' ? `Pending (${pendingTrades.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowPropose(true)}>
          + Propose Trade
        </button>
      </div>

      {allTrades.length === 0 ? (
        <EmptyState icon="🔄" text={`No ${tab} trades`} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {allTrades.map((trade) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              isCommissioner={user?.role === 'commissioner'}
              onApprove={() => handleApprove(trade.id)}
              onReject={() => handleReject(trade.id)}
            />
          ))}
        </div>
      )}

      {showPropose && (
        <ProposeTradeModal
          onClose={() => setShowPropose(false)}
          onProposed={() => { setShowPropose(false); load(); }}
        />
      )}
    </Layout>
  );
}

function TradeCard({ trade, isCommissioner, onApprove, onReject }) {
  const assets = trade.assets || [];
  const fromAssets = assets.filter((a) => a.from_team_id === trade.proposing_team_id);
  const toAssets = assets.filter((a) => a.from_team_id === trade.receiving_team_id);

  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{trade.proposing_team_name}</span>
          <span style={{ color: 'var(--text-muted)' }}>↔</span>
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{trade.receiving_team_name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusBadge status={trade.status} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            {format(new Date(trade.proposed_at), 'MM/dd/yy HH:mm')}
          </span>
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
          {/* Proposing team gives */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              {trade.proposing_team_name} gives
            </div>
            {fromAssets.map((a, i) => (
              <div key={i} style={{ padding: '4px 0', fontSize: '0.82rem', color: a.asset_type === 'prospect' ? 'var(--yellow)' : 'var(--text-primary)' }}>
                {a.asset_type === 'prospect' && '🌱 '}
                {a.player_name}
              </div>
            ))}
            {fromAssets.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Nothing</div>}
          </div>

          <div style={{ paddingTop: 28, color: 'var(--text-muted)', fontSize: '1.2rem', textAlign: 'center' }}>⇄</div>

          {/* Receiving team gives */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              {trade.receiving_team_name} gives
            </div>
            {toAssets.map((a, i) => (
              <div key={i} style={{ padding: '4px 0', fontSize: '0.82rem', color: a.asset_type === 'prospect' ? 'var(--yellow)' : 'var(--text-primary)' }}>
                {a.asset_type === 'prospect' && '🌱 '}
                {a.player_name}
              </div>
            ))}
            {toAssets.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Nothing</div>}
          </div>
        </div>

        {trade.notes && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            📝 {trade.notes}
          </div>
        )}

        {/* Commissioner actions */}
        {isCommissioner && ['pending', 'commissioner_review'].includes(trade.status) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-success" onClick={onApprove}>✓ Approve & Execute</button>
            <button className="btn btn-danger" onClick={onReject}>✕ Reject</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProposeTradeModal({ onClose, onProposed }) {
  const [teams, setTeams] = useState([]);
  const [propTeamId, setPropTeamId] = useState('');
  const [recvTeamId, setRecvTeamId] = useState('');
  const [propRoster, setPropRoster] = useState([]);
  const [recvRoster, setRecvRoster] = useState([]);
  const [propSelected, setPropSelected] = useState([]);
  const [recvSelected, setRecvSelected] = useState([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { getTeams().then((r) => setTeams(r.data)); }, []);

  useEffect(() => {
    if (propTeamId) getTeamRoster(propTeamId).then((r) => setPropRoster(r.data.filter((p) => p.slot_type !== 'PROSPECT' || true)));
  }, [propTeamId]);

  useEffect(() => {
    if (recvTeamId) getTeamRoster(recvTeamId).then((r) => setRecvRoster(r.data));
  }, [recvTeamId]);

  const toggleSelect = (list, setList, playerId) => {
    setList(list.includes(playerId) ? list.filter((id) => id !== playerId) : [...list, playerId]);
  };

  const handlePropose = async () => {
    if (!propTeamId || !recvTeamId) return toast.error('Select both teams');
    if (propTeamId === recvTeamId) return toast.error('Cannot trade with yourself');
    setSaving(true);
    try {
      await proposeTrade({
        proposingTeamId: propTeamId,
        receivingTeamId: recvTeamId,
        assetsFrom: propSelected.map((id) => ({ playerMlbId: id })),
        assetsTo: recvSelected.map((id) => ({ playerMlbId: id })),
        notes,
      });
      toast.success('Trade proposed');
      onProposed();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to propose trade');
    } finally { setSaving(false); }
  };

  const RosterPicker = ({ roster, selected, onToggle, label }) => (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {roster.length === 0
          ? <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Select a team first</div>
          : roster.map((p) => (
            <div
              key={p.player_id}
              onClick={() => onToggle(p.mlb_id)}
              style={{
                padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '0.8rem', borderBottom: '1px solid var(--border)',
                background: selected.includes(p.mlb_id) ? 'var(--accent-glow)' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: 2,
                border: `2px solid ${selected.includes(p.mlb_id) ? 'var(--accent)' : 'var(--border-bright)'}`,
                background: selected.includes(p.mlb_id) ? 'var(--accent)' : 'transparent',
                flexShrink: 0,
              }} />
              <PositionBadge position={p.slot_type} />
              <span style={{ flex: 1 }}>{p.full_name}</span>
              {p.slot_type === 'PROSPECT' && <Badge label="Prospect" type="yellow" />}
            </div>
          ))
        }
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Propose Trade</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid grid-2" style={{ marginBottom: 20 }}>
            <div className="form-group">
              <label className="form-label">Proposing Team</label>
              <select className="select" value={propTeamId} onChange={(e) => setPropTeamId(e.target.value)}>
                <option value="">Select team...</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Receiving Team</label>
              <select className="select" value={recvTeamId} onChange={(e) => setRecvTeamId(e.target.value)}>
                <option value="">Select team...</option>
                {teams.filter((t) => t.id !== propTeamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-2" style={{ marginBottom: 16 }}>
            <RosterPicker
              roster={propRoster}
              selected={propSelected}
              onToggle={(id) => toggleSelect(propSelected, setPropSelected, id)}
              label="Proposing team sends"
            />
            <RosterPicker
              roster={recvRoster}
              selected={recvSelected}
              onToggle={(id) => toggleSelect(recvSelected, setRecvSelected, id)}
              label="Receiving team sends"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Trade details or context..." />
          </div>

          {(propSelected.length > 0 || recvSelected.length > 0) && (
            <div className="alert alert-info">
              {propSelected.length} player(s) going out · {recvSelected.length} player(s) coming in
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handlePropose} disabled={saving}>
            {saving ? 'Proposing...' : 'Propose Trade'}
          </button>
        </div>
      </div>
    </div>
  );
}
