import React, { useState, useEffect, useCallback } from 'react';
import { format, subDays, addDays } from 'date-fns';
import toast from 'react-hot-toast';
import Layout from '../components/shared/Layout';
import { LoadingSpinner, EmptyState, Badge } from '../components/shared/ui';
import { getDailyScores, pullStats, runScoring } from '../utils/api';
import { useAuth } from '../App';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const TEAM_COLORS = ['#3d8bff','#22c55e','#f97316','#a855f7','#ef4444','#eab308'];

export default function ScoringPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(null);
  const isCommissioner = user?.role === 'commissioner';

  const load = useCallback(() => {
    setLoading(true);
    getDailyScores(date)
      .then((r) => setScores(r.data))
      .catch(() => setScores([]))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const handlePull = async () => {
    setRunning('pull');
    try {
      await pullStats(date);
      toast.success(`Stats pulled for ${date}`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Pull failed'); }
    finally { setRunning(null); }
  };

  const handleScore = async () => {
    setRunning('score');
    try {
      await runScoring(date);
      toast.success(`Scoring run for ${date}`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Scoring failed'); }
    finally { setRunning(null); }
  };

  const chartData = [...scores]
    .sort((a, b) => b.fantasy_points - a.fantasy_points)
    .map((s, i) => ({
      name: s.abbreviation || s.team_name?.slice(0, 8),
      fp: parseFloat(s.fantasy_points).toFixed(1),
      rankPts: s.rank_points,
      color: TEAM_COLORS[i % TEAM_COLORS.length],
    }));

  return (
    <Layout
      title="Scoring"
      subtitle="Daily fantasy point results and rank allocation"
    >
      {/* Date navigation + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setDate(format(subDays(new Date(date), 1), 'yyyy-MM-dd'))}>←</button>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: 160 }}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => setDate(format(addDays(new Date(date), 1), 'yyyy-MM-dd'))}>→</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}>
          Yesterday
        </button>

        {isCommissioner && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePull} disabled={!!running}>
              {running === 'pull' ? '⏳ Pulling...' : '📥 Pull Stats'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleScore} disabled={!!running}>
              {running === 'score' ? '⏳ Scoring...' : '📊 Run Scoring'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSpinner text="Loading scores..." />
      ) : scores.length === 0 ? (
        <EmptyState icon="📊" text={`No scoring data for ${date}`} />
      ) : (
        <>
          {/* Combined day notice */}
          {scores[0]?.is_combined_day && (
            <div className="alert alert-warning" style={{ marginBottom: 20 }}>
              ⚡ Combined Day — fewer than 20 MLB teams played, so this day's scoring was combined with the following day.
            </div>
          )}

          {/* Bar chart */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div className="card-title">Fantasy Points — {date}</div>
            </div>
            <div className="card-body" style={{ paddingBottom: 8 }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="fp" radius={[3,3,0,0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Results table */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Results</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                Rank pts = teams beaten · Tiebreakers: SV → HR → SP Pts
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th style={{ textAlign: 'right' }}>Fantasy Pts</th>
                  <th style={{ textAlign: 'right' }}>Rank Pts</th>
                  <th style={{ textAlign: 'right' }}>Games</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...scores].sort((a, b) => a.rank - b.rank).map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontWeight: 700,
                        fontSize: '1.1rem',
                      }} className={`rank-${s.rank}`}>
                        #{s.rank}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.88rem' }}>{s.team_name}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="stat-num">{parseFloat(s.fantasy_points).toFixed(1)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem',
                        color: s.rank === 1 ? 'var(--green)' : s.rank === scores.length ? 'var(--red)' : 'var(--text-secondary)',
                      }}>
                        +{s.rank_points}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {s.games_counted}
                    </td>
                    <td>
                      {s.is_combined_day && <Badge label="Combined" type="yellow" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  );
}
