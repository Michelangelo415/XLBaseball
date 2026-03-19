const cron = require('node-cron');
const { format, subDays } = require('date-fns');
const scoring = require('../services/scoring');
const lineup = require('../services/lineup');
const prospects = require('../services/prospects');
const mlbApi = require('../services/mlbApi');
const db = require('../db');

/**
 * Register all scheduled jobs
 */
const registerJobs = () => {
  // ─────────────────────────────────────────────
  // Pull yesterday's final stats — runs at 6 AM ET daily
  // ─────────────────────────────────────────────
  cron.schedule('0 6 * * *', async () => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    console.log(`[Cron] Running daily stat pull for ${yesterday}`);
    try {
      await scoring.pullDailyStats(yesterday);
      await scoring.scoreTeamsForDate(yesterday);
      console.log(`[Cron] Scoring complete for ${yesterday}`);
    } catch (err) {
      console.error('[Cron] Daily scoring error:', err.message);
    }
  }, { timezone: 'America/New_York' });

  // ─────────────────────────────────────────────
  // Build today's lineups — runs at 10 AM ET daily
  // ─────────────────────────────────────────────
  cron.schedule('0 10 * * *', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    console.log(`[Cron] Building lineups for ${today}`);
    try {
      const { rows: teams } = await db.query('SELECT * FROM teams WHERE season = 2026');
      for (const team of teams) {
        await lineup.buildDailyLineup(team.id, today);
        await lineup.selectSPsForDate(team.id, today);
      }
      await lineup.triggerFreeAgentFill(today);
      console.log(`[Cron] Lineups built for ${today}`);
    } catch (err) {
      console.error('[Cron] Lineup build error:', err.message);
    }
  }, { timezone: 'America/New_York' });

  // ─────────────────────────────────────────────
  // Check prospect status — runs at 11 AM ET daily
  // ─────────────────────────────────────────────
  cron.schedule('0 11 * * *', async () => {
    console.log('[Cron] Checking prospect statuses');
    try {
      await prospects.checkProspectStatus();
      await prospects.processExpiredProspectDeadlines();
    } catch (err) {
      console.error('[Cron] Prospect check error:', err.message);
    }
  }, { timezone: 'America/New_York' });

  // ─────────────────────────────────────────────
  // Roster lock enforcement — runs daily at midnight ET
  // Locks all rosters on September 15
  // ─────────────────────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { rows: settings } = await db.query(
      'SELECT roster_lock_date FROM league_settings WHERE season = 2026'
    );
    if (settings.length && today >= settings[0].roster_lock_date) {
      await db.query(`
        UPDATE daily_lineups SET locked = true
        WHERE lineup_date <= $1 AND locked = false
      `, [today]);
      console.log('[Cron] Rosters locked for season end');
    }
  }, { timezone: 'America/New_York' });

  // ─────────────────────────────────────────────
  // Sync MLB player data — runs every Monday at 7 AM
  // ─────────────────────────────────────────────
  cron.schedule('0 7 * * 1', async () => {
    console.log('[Cron] Syncing MLB player data');
    try {
      await syncPlayerData();
    } catch (err) {
      console.error('[Cron] Player sync error:', err.message);
    }
  }, { timezone: 'America/New_York' });

  console.log('[Cron] All scheduled jobs registered');
};

/**
 * Sync active MLB roster players to our DB
 */
const syncPlayerData = async () => {
  const teams = await mlbApi.getAllRosters();
  let synced = 0;

  for (const team of teams) {
    const roster = team.roster || [];
    for (const player of roster) {
      const p = player.person;
      if (!p) continue;

      await db.query(`
        INSERT INTO mlb_players (mlb_id, full_name, first_name, last_name, primary_position,
          mlb_team, mlb_team_id, status, last_synced)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
        ON CONFLICT (mlb_id) DO UPDATE SET
          mlb_team = EXCLUDED.mlb_team,
          mlb_team_id = EXCLUDED.mlb_team_id,
          status = 'active',
          last_synced = NOW()
      `, [
        p.id,
        p.fullName,
        p.firstName || '',
        p.lastName || '',
        player.position?.abbreviation || 'UTIL',
        team.name,
        team.id,
      ]);
      synced++;
    }
  }

  console.log(`[Sync] Synced ${synced} MLB players`);
  return synced;
};

module.exports = { registerJobs, syncPlayerData };
