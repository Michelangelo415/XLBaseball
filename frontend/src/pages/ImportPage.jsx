import React, { useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '../components/shared/Layout';
import { importRosters, downloadTemplate } from '../utils/api';

export default function ImportPage() {
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const extractSheetId = (input) => {
    const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input.trim();
  };

  const handleImport = async () => {
    if (!spreadsheetId.trim()) return toast.error('Enter a Google Sheets URL or ID');
    const id = extractSheetId(spreadsheetId);
    setImporting(true);
    setResult(null);
    try {
      const r = await importRosters(id);
      setResult(r.data);
      if (r.data.errors?.length === 0 && r.data.playersNotFound?.length === 0) {
        toast.success(`Import complete: ${r.data.playersImported} players imported`);
      } else {
        toast.success(`Import done with some issues — see results below`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally { setImporting(false); }
  };

  return (
    <Layout
      title="Import Rosters"
      subtitle="Load team rosters from Google Sheets"
    >
      <div style={{ maxWidth: 680 }}>
        {/* Setup Guide */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><div className="card-title">📋 Setup Guide</div></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['1', 'Download the import template below and copy it into Google Sheets'],
                ['2', 'Fill in your team rosters following the column format'],
                ['3', 'Share your Google Sheet with the service account email (set to Viewer)'],
                ['4', 'Paste the Sheet URL or ID below and click Import'],
              ].map(([step, text]) => (
                <div key={step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    minWidth: 24, height: 24, background: 'var(--accent)', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: '#fff',
                  }}>{step}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', paddingTop: 3 }}>{text}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 8 }}>
                EXPECTED COLUMN FORMAT
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                {['Team Name', 'Player Name', 'Slot Type', 'Roster Level', 'MLB ID', 'Notes'].map((col, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-active)', padding: '4px 8px', borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--accent)', textAlign: 'center',
                  }}>{col}</div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Slot Type: SP, RP, C, 1B, 2B, SS, 3B, INF, OF, UT, DH, PROSPECT<br />
                Roster Level: MLB1, MLB2, PROSPECT
              </div>
            </div>

            <a href={downloadTemplate()} download="roster_import_template.csv" style={{ textDecoration: 'none' }}>
              <button className="btn btn-secondary" style={{ marginTop: 16 }}>
                ⬇ Download CSV Template
              </button>
            </a>
          </div>
        </div>

        {/* Import Form */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><div className="card-title">🔗 Import from Google Sheets</div></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Google Sheet URL or ID</label>
              <input
                className="input"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/... or just the ID"
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                The Sheet must be shared with your service account or made public viewer
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={handleImport}
              disabled={importing || !spreadsheetId.trim()}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {importing ? '⏳ Importing...' : '📥 Import Rosters'}
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="card">
            <div className="card-header"><div className="card-title">Import Results</div></div>
            <div className="card-body">
              <div className="grid grid-3" style={{ marginBottom: 16 }}>
                <div style={{ textAlign: 'center', padding: '12px', background: 'var(--green-dim)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--green)' }}>
                    {result.playersImported}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--green)', marginTop: 2 }}>Players Imported</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'var(--yellow-dim)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--yellow)' }}>
                    {result.teamsProcessed}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--yellow)', marginTop: 2 }}>Teams Processed</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: result.errors?.length ? 'var(--red-dim)' : 'var(--bg-elevated)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: result.errors?.length ? 'var(--red)' : 'var(--text-muted)' }}>
                    {result.errors?.length || 0}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: result.errors?.length ? 'var(--red)' : 'var(--text-muted)', marginTop: 2 }}>Errors</div>
                </div>
              </div>

              {result.playersNotFound?.length > 0 && (
                <div className="alert alert-warning">
                  <strong>Players not found in database ({result.playersNotFound.length}):</strong>
                  <div style={{ marginTop: 6 }}>
                    {result.playersNotFound.map((p, i) => (
                      <div key={i} style={{ fontSize: '0.75rem' }}>{p.team}: {p.player}</div>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.72rem', marginTop: 8, opacity: 0.8 }}>
                    Tip: Add the MLB ID column to your sheet for exact matches, or sync MLB rosters first via Commissioner Dashboard.
                  </div>
                </div>
              )}

              {result.errors?.length > 0 && (
                <div className="alert alert-error">
                  <strong>Errors:</strong>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: '0.75rem', marginTop: 4 }}>{e}</div>
                  ))}
                </div>
              )}

              {result.playersImported > 0 && result.errors?.length === 0 && result.playersNotFound?.length === 0 && (
                <div className="alert alert-success">
                  ✓ All rosters imported successfully. Visit Teams to verify the results.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
