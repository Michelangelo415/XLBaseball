const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const scoring = require('../services/scoring');
const lineup = require('../services/lineup');
const trades = require('../services/trades');
const prospects = require('../services/prospects');
const sheetsImport = require('../services/sheetsImport');
const { syncPlayerData } = require('../jobs/scheduler');

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────
router.post('/auth/login', auth.login);
router.post('/auth/register', auth.register);
router.get('/auth/me', auth.authenticate, async (req, res) => {
  const { rows: teams } = await db.query(
    'SELECT * FROM teams WHERE owner_id = $1 AND season = 2025', [req.user.id]
  );
  res.json({ user: req.user, team: teams[0] || null });
});

// ─────────────────────────────────────────────
// League / Settings
// ─────────────────────────────────────────────
router.get('/league/settings', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM league_settings WHERE season = 2025');
  res.json(rows[0] || {});
});

router.get('/league/standings', async (req, res) => {
  const { rows } = await db.query(`
    SELECT ss.*, t.name as team_name, t.abbreviation, u.name as owner_name
    FROM season_standings ss
    JOIN teams t ON t.id = ss.team_id
    JOIN users u ON u.id = t.owner_id
    WHERE ss.season = 2025
    ORDER BY ss.current_rank ASC
  `);
  res.json(rows);
});

router.get('/league/activity', auth.authenticate, async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const { rows } = await db.query(`
    SELECT al.*, t.name as team_name
    FROM activity_log al
    LEFT JOIN teams t ON t.id = al.team_id
    ORDER BY al.created_at DESC
    LIMIT $1
  `, [limit]);
  res.json(rows);
});

// ─────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────
router.get('/teams', async (req, res) => {
  const { rows } = await db.query(`
    SELECT t.*, u.name as owner_name, u.email as owner_email
    FROM teams t
    JOIN users u ON u.id = t.owner_id
    WHERE t.season = 2025
    ORDER BY t.name
  `);
  res.json(rows);
});

router.get('/teams/:teamId', async (req, res) => {
  const { rows } = await db.query(`
    SELECT t.*, u.name as owner_name
    FROM teams t
    JOIN users u ON u.id = t.owner_id
    WHERE t.id = $1
  `, [req.params.teamId]);
  if (!rows.length) return res.status(404).json({ error: 'Team not found' });
  res.json(rows[0]);
});

router.get('/teams/:teamId/roster', async (req, res) => {
  const { rows } = await db.query(`
    SELECT rs.*, mp.full_name, mp.primary_position, mp.positions,
           mp.mlb_team, mp.status, mp.headshot_url, mp.is_prospect,
           mp.games_by_position, mp.rp_starts, mp.rp_converted_to_sp
    FROM roster_slots rs
    JOIN mlb_players mp ON mp.mlb_id = rs.player_id
    WHERE rs.team_id = $1 AND rs.is_active = true AND rs.season = 2025
    ORDER BY
      CASE rs.slot_type
        WHEN 'SP' THEN 1 WHEN 'RP' THEN 2 WHEN 'C' THEN 3
        WHEN '1B' THEN 4 WHEN '2B' THEN 5 WHEN 'SS' THEN 6
        WHEN '3B' THEN 7 WHEN 'INF' THEN 8 WHEN 'OF' THEN 9
        WHEN 'UT' THEN 10 WHEN 'DH' THEN 11 WHEN 'PROSPECT' THEN 12
        ELSE 13
      END, rs.slot_number
  `, [req.params.teamId]);
  res.json(rows);
});

router.get('/teams/:teamId/lineup/:date', auth.authenticate, async (req, res) => {
  const { rows } = await db.query(`
    SELECT dl.*, mp.full_name, mp.headshot_url, mp.primary_position
    FROM daily_lineups dl
    JOIN mlb_players mp ON mp.mlb_id = dl.player_mlb_id
    WHERE dl.team_id = $1 AND dl.lineup_date = $2
    ORDER BY dl.slot_type
  `, [req.params.teamId, req.params.date]);
  res.json(rows);
});

router.get('/teams/:teamId/scores', async (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  const { rows } = await db.query(`
    SELECT * FROM daily_team_scores
    WHERE team_id = $1
    ORDER BY score_date DESC
    LIMIT $2
  `, [req.params.teamId, limit]);
  res.json(rows);
});

router.post('/teams', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const { name, abbreviation, ownerEmail, ownerName } = req.body;

  // Find or create owner user
  let { rows: users } = await db.query('SELECT * FROM users WHERE email = $1', [ownerEmail]);
  let owner = users[0];

  if (!owner) {
    const tempPassword = Math.random().toString(36).slice(-8);
    const hash = await auth.bcrypt.hash(tempPassword, 12);
    const { rows: newUser } = await db.query(`
      INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'owner') RETURNING *
    `, [ownerEmail, hash, ownerName]);
    owner = newUser[0];
    // In production: send email with temp password
  }

  const { rows } = await db.query(`
    INSERT INTO teams (owner_id, name, abbreviation, season)
    VALUES ($1, $2, $3, 2025) RETURNING *
  `, [owner.id, name, abbreviation]);

  // Initialize standings row
  await db.query(`
    INSERT INTO season_standings (team_id, season) VALUES ($1, 2025) ON CONFLICT DO NOTHING
  `, [rows[0].id]);

  res.status(201).json(rows[0]);
});

// ─────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────
router.get('/players/search', auth.authenticate, async (req, res) => {
  const { q, position, available } = req.query;

  let queryStr = `
    SELECT mp.*, rs.team_id, t.name as fantasy_team_name
    FROM mlb_players mp
    LEFT JOIN roster_slots rs ON rs.player_id = mp.mlb_id AND rs.is_active = true AND rs.season = 2025
    LEFT JOIN teams t ON t.id = rs.team_id
    WHERE 1=1
  `;
  const params = [];
  let paramIdx = 1;

  if (q) {
    queryStr += ` AND LOWER(mp.full_name) LIKE LOWER($${paramIdx++})`;
    params.push(`%${q}%`);
  }
  if (position) {
    queryStr += ` AND (mp.primary_position = $${paramIdx++} OR mp.positions @> $${paramIdx++}::jsonb)`;
    params.push(position, JSON.stringify([position]));
    paramIdx++;
  }
  if (available === 'true') {
    queryStr += ` AND rs.team_id IS NULL`;
  }

  queryStr += ` ORDER BY mp.last_name, mp.first_name LIMIT 50`;

  const { rows } = await db.query(queryStr, params);
  res.json(rows);
});

router.get('/players/:mlbId', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM mlb_players WHERE mlb_id = $1', [req.params.mlbId]);
  if (!rows.length) return res.status(404).json({ error: 'Player not found' });

  const { rows: recentStats } = await db.query(`
    SELECT * FROM player_game_stats
    WHERE player_mlb_id = $1
    ORDER BY game_date DESC LIMIT 15
  `, [req.params.mlbId]);

  res.json({ player: rows[0], recentStats });
});

router.get('/players/:mlbId/stats', async (req, res) => {
  const { season } = req.query;
  const { rows } = await db.query(`
    SELECT
      stat_type,
      SUM(fantasy_points) as total_fantasy_points,
      COUNT(*) as games_played,
      SUM(home_runs) as home_runs,
      SUM(rbi) as rbi,
      SUM(stolen_bases) as stolen_bases,
      SUM(saves) as saves,
      SUM(strikeouts_pitcher) as strikeouts,
      SUM(outs_recorded) as outs_recorded
    FROM player_game_stats
    WHERE player_mlb_id = $1
    AND game_date >= $2
    GROUP BY stat_type
  `, [req.params.mlbId, `${season || 2025}-01-01`]);
  res.json(rows);
});

// ─────────────────────────────────────────────
// Roster Management
// ─────────────────────────────────────────────
router.post('/roster/add', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const { teamId, playerMlbId, slotType, rosterLevel } = req.body;

  // Count current players in this slot type
  const { rows: existing } = await db.query(`
    SELECT COUNT(*) as count FROM roster_slots
    WHERE team_id = $1 AND slot_type = $2 AND is_active = true AND season = 2025
  `, [teamId, slotType]);

  const slotNumber = parseInt(existing[0].count) + 1;

  await db.query(`
    INSERT INTO roster_slots (team_id, slot_type, slot_number, player_id, roster_level, season, acquired_via)
    VALUES ($1, $2, $3, $4, $5, 2025, 'commissioner')
  `, [teamId, slotType, slotNumber, playerMlbId, rosterLevel || 'MLB1']);

  await db.query(`
    INSERT INTO activity_log (team_id, action_type, description)
    VALUES ($1, 'player_added', $2)
  `, [teamId, `Player ${playerMlbId} added to ${slotType} slot`]);

  res.json({ success: true });
});

router.post('/roster/drop', auth.authenticate, async (req, res) => {
  const { teamId, playerMlbId } = req.body;

  await db.query(`
    UPDATE roster_slots SET is_active = false
    WHERE team_id = $1 AND player_id = $2 AND season = 2025
  `, [teamId, playerMlbId]);

  res.json({ success: true });
});

router.post('/roster/convert-rp-to-sp', auth.authenticate, async (req, res) => {
  const { teamId, playerMlbId } = req.body;

  // Move player from RP slot to SP slot
  await db.query(`
    UPDATE roster_slots SET slot_type = 'SP'
    WHERE team_id = $1 AND player_id = $2 AND slot_type = 'RP' AND season = 2025
  `, [teamId, playerMlbId]);

  await db.query(`
    UPDATE mlb_players SET primary_position = 'SP', rp_converted_to_sp = true
    WHERE mlb_id = $1
  `, [playerMlbId]);

  res.json({ success: true });
});

// ─────────────────────────────────────────────
// Trades
// ─────────────────────────────────────────────
router.get('/trades', auth.authenticate, async (req, res) => {
  const { status } = req.query;
  let queryStr = `
    SELECT tr.*, pt.name as proposing_team_name, rt.name as receiving_team_name
    FROM trades tr
    JOIN teams pt ON pt.id = tr.proposing_team_id
    JOIN teams rt ON rt.id = tr.receiving_team_id
    WHERE tr.season = 2025
  `;
  const params = [];
  if (status) {
    queryStr += ' AND tr.status = $1';
    params.push(status);
  }
  queryStr += ' ORDER BY tr.proposed_at DESC';
  const { rows } = await db.query(queryStr, params);
  res.json(rows);
});

router.get('/trades/pending', auth.authenticate, async (req, res) => {
  const pending = await trades.getPendingTrades();
  res.json(pending);
});

router.post('/trades/propose', auth.authenticate, async (req, res) => {
  const { proposingTeamId, receivingTeamId, assetsFrom, assetsTo, notes } = req.body;
  const trade = await trades.proposeTrade(proposingTeamId, receivingTeamId, assetsFrom, assetsTo, notes);
  res.status(201).json(trade);
});

router.post('/trades/:tradeId/accept', auth.authenticate, async (req, res) => {
  const result = await trades.acceptTrade(req.params.tradeId, req.body.teamId);
  res.json(result);
});

router.post('/trades/:tradeId/approve', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const result = await trades.approveTrade(req.params.tradeId);
  res.json(result);
});

router.post('/trades/:tradeId/reject', auth.authenticate, async (req, res) => {
  const result = await trades.rejectTrade(req.params.tradeId, req.body.reason);
  res.json(result);
});

// ─────────────────────────────────────────────
// Prospects
// ─────────────────────────────────────────────
router.get('/prospects', auth.authenticate, async (req, res) => {
  const { rows } = await db.query(`
    SELECT pr.*, mp.full_name, mp.primary_position, mp.mlb_team, t.name as fantasy_team_name
    FROM prospect_rights pr
    JOIN mlb_players mp ON mp.mlb_id = pr.player_mlb_id
    JOIN teams t ON t.id = pr.team_id
    WHERE pr.season = 2025
    ORDER BY pr.status, mp.last_name
  `);
  res.json(rows);
});

router.post('/prospects/activate', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const { teamId, playerMlbId, slotType } = req.body;
  await prospects.activateProspect(teamId, playerMlbId, slotType);
  res.json({ success: true });
});

router.post('/prospects/release', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const { teamId, playerMlbId } = req.body;
  await prospects.releaseProspectToFreeAgency(teamId, playerMlbId);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// Scoring & Stats
// ─────────────────────────────────────────────
router.get('/scoring/daily/:date', async (req, res) => {
  const { rows } = await db.query(`
    SELECT dts.*, t.name as team_name, t.abbreviation
    FROM daily_team_scores dts
    JOIN teams t ON t.id = dts.team_id
    WHERE dts.score_date = $1
    ORDER BY dts.rank ASC
  `, [req.params.date]);
  res.json(rows);
});

router.post('/scoring/run/:date', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const result = await scoring.scoreTeamsForDate(req.params.date);
  res.json({ success: true, teams: result.length });
});

router.post('/scoring/pull/:date', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const count = await scoring.pullDailyStats(req.params.date);
  res.json({ success: true, gamesProcessed: count });
});

// ─────────────────────────────────────────────
// Import
// ─────────────────────────────────────────────
router.post('/import/rosters', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const { spreadsheetId } = req.body;
  if (!spreadsheetId) return res.status(400).json({ error: 'spreadsheetId required' });
  const results = await sheetsImport.importRostersFromSheet(spreadsheetId);
  res.json(results);
});

router.get('/import/template', (req, res) => {
  const csv = sheetsImport.generateImportTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="roster_import_template.csv"');
  res.send(csv);
});

// ─────────────────────────────────────────────
// Admin / Commissioner tools
// ─────────────────────────────────────────────
router.post('/admin/sync-players', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const count = await syncPlayerData();
  res.json({ success: true, synced: count });
});

router.post('/admin/check-prospects', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  await prospects.checkProspectStatus();
  await prospects.processExpiredProspectDeadlines();
  res.json({ success: true });
});

router.get('/admin/activity', auth.authenticate, auth.requireCommissioner, async (req, res) => {
  const { rows } = await db.query(`
    SELECT al.*, t.name as team_name, u.name as user_name
    FROM activity_log al
    LEFT JOIN teams t ON t.id = al.team_id
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT 200
  `);
  res.json(rows);
});

module.exports = router;
