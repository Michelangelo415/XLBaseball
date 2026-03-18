import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../components/shared/Layout';
import { LoadingSpinner, EmptyState } from '../components/shared/ui';
import { getTeams, createTeam } from '../utils/api';
import { useAuth } from '../App';

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', abbreviation: '', ownerEmail: '', ownerName: '' });
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const load = () => {
    getTeams()
      .then((r) => setTeams(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.abbreviation || !form.ownerEmail || !form.ownerName) {
      return toast.error('All fields required');
    }
    setSaving(true);
    try {
      await createTeam(form);
      toast.success(`Team "${form.name}" created`);
      setForm({ name: '', abbreviation: '', ownerEmail: '', ownerName: '' });
      setShowCreate(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create team');
    } finally { setSaving(false); }
  };

  if (loading) return <Layout title="Teams"><LoadingSpinner text="Loading teams..." /></Layout>;

  return (
    <Layout
      title="Teams & Rosters"
      subtitle={`${teams.length} teams · 2025 season`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div />
        {user?.role === 'commissioner' && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Add Team
          </button>
        )}
      </div>

      {teams.length === 0 ? (
        <EmptyState icon="👥" text="No teams yet. Add teams to get started." />
      ) : (
        <div className="grid grid-2" style={{ gap: 16 }}>
          {teams.map((team) => (
            <Link key={team.id} to={`/teams/${team.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-bright)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {team.name}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)', letterSpacing: '0.15em', marginTop: 2 }}>
                        {team.abbreviation}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Owner</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{team.owner_name}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 20 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Total FP</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem' }}>
                        {parseFloat(team.total_fantasy_points || 0).toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Record</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem' }}>
                        {team.wins || 0}–{team.losses || 0}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>View Roster →</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Team Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Add Team</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">Team Name</label>
                    <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Brewhouse Bandits" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Abbreviation</label>
                    <input className="input" value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value.toUpperCase().slice(0, 5) })} placeholder="e.g. BHB" maxLength={5} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Owner Name</label>
                  <input className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="Full name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Owner Email</label>
                  <input className="input" type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} placeholder="owner@example.com" />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    A temporary password will be generated for new accounts
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
