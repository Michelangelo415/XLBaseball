const db = require('../db');
const mlbApi = require('./mlbApi');
const { format, subDays } = require('date-fns');

// ─────────────────────────────────────────────
// Roster Config
// ─────────────────────────────────────────────
const ROSTER_SLOTS = {
  SP: 5, RP: 7, C: 2, '1B': 1, '2B': 1, SS: 1, '3B': 1, INF: 2, OF: 4, UT: 1, DH: 1,
};

const POSITION_ELIGIBLE = {
  C: ['C'],
  '1B': ['1B'],
  '2B': ['2B'],
  SS: ['SS'],
  '3B': ['3B'],
  INF: ['1B', '2B', 'SS', '3B'],
  OF: ['OF', 'LF', 'CF', 'RF'],
  UT: ['C', '1B', '2B', 'SS', '3B', 'OF', 'LF', 'CF', 'RF', 'DH'],
  DH: ['DH', '1B', '2B', 'SS', '3B', 'OF', 'LF', 'CF', 'RF', 'C'],
};

// ─────────────────────────────────────────────
// Position Eligibility
// ─────────────────────────────────────────────

/**
 * Check if a player is eligible for a given slot
 * Rule: must have played 5+ games at position in past 3 years
 * Rookies use MiLB position until they have 5 MLB games at position
 */
const isEligibleForSlot = (player, slotType) => {
  if (slotType === 'SP' || slotType === 'RP') {
    return player.primary_position === 'SP' || player.primary_position === 'RP' ||
      player.primary_position === 'P';
  }

  const eligiblePositions = POSITION_ELIGIBLE[slotType] || [slotType];
  const gamesByPos = player.games_by_position || {};

  for (const pos of eligiblePositions) {
    if ((gamesByPos[pos] || 0) >= 5) return true;
  }

  // Rookie fallback: use MiLB position
  if (player.milb_position && eligiblePositions.includes(player.milb_position)) {
    return true;
  }

  return false;
};

// ─────────────────────────────────────────────
// SP Selection Logic
// ─────────────────────────────────────────────

/**
 * Select SP for a team for a given date
 * Rules:
 * - 1 SP per game
 * - Team's top-ranked SP that pitches day-of OR 1 day prior is auto-selected
 * - If no rostered SP: prospect spot start allowed
 * - If no rostered SP and RP is probable starter: RP can be used as SP
 * - Mini-drafted SPs must go same day as game
 * - RP converted to SP after 5 starts (mandatory)
 */
const selectSPsForDate = async (teamId, date) => {
  const games = await mlbApi.getSchedule(date);
  const gamePks = games.map((g) => g.gamePk);

  // Get probable pitchers for today
  const probables = await mlbApi.getProbablePitchers(date);
  const probableIds = new Set(probables.map((p) => p.pitcher.id));

  // Get this team's rostered SPs (slot type SP)
  const { rows: rosteredSPs } = await db.query(`
    SELECT rs.*, mp.mlb_id, mp.full_name, mp.rp_starts, mp.rp_converted_to_sp,
           mp.primary_position, mp.mlb_team_id
    FROM roster_slots rs
    JOIN mlb_players mp ON mp.mlb_id = rs.player_id
    WHERE rs.team_id = $1 AND rs.slot_type = 'SP' AND rs.is_active = true
    ORDER BY rs.slot_number ASC
  `, [teamId]);

  // Get rostered RPs
  const { rows: rosteredRPs } = await db.query(`
    SELECT rs.*, mp.mlb_id, mp.full_name, mp.rp_starts, mp.primary_position, mp.mlb_team_id
    FROM roster_slots rs
    JOIN mlb_players mp ON mp.mlb_id = rs.player_id
    WHERE rs.team_id = $1 AND rs.slot_type = 'RP' AND rs.is_active = true
  `, [teamId]);

  const assignments = [];

  for (const game of games) {
    // Find highest-ranked SP who is probable for this game
    const eligibleSP = rosteredSPs.find((sp) => probableIds.has(sp.mlb_id));

    if (eligibleSP) {
      assignments.push({
        teamId,
        playerId: eligibleSP.mlb_id,
        gameDate: date,
        gamePk: game.gamePk,
        assignmentType: 'rostered',
        isMiniDraft: false,
      });
    } else {
      // No rostered SP available — check RP as probable starter
      const rpAsSP = rosteredRPs.find((rp) => probableIds.has(rp.mlb_id));
      if (rpAsSP) {
        assignments.push({
          teamId,
          playerId: rpAsSP.mlb_id,
          gameDate: date,
          gamePk: game.gamePk,
          assignmentType: 'rp_as_sp',
          isMiniDraft: false,
        });

        // Track starts for RP->SP conversion rule (mandatory after 5 starts)
        await db.query(`
          UPDATE mlb_players SET rp_starts = rp_starts + 1 WHERE mlb_id = $1
        `, [rpAsSP.mlb_id]);

        const updatedStarts = rpAsSP.rp_starts + 1;
        if (updatedStarts >= 5 && !rpAsSP.rp_converted_to_sp) {
          await db.query(`
            UPDATE mlb_players SET rp_converted_to_sp = true, primary_position = 'SP'
            WHERE mlb_id = $1
          `, [rpAsSP.mlb_id]);
          console.log(`[Lineup] RP ${rpAsSP.full_name} mandatorily converted to SP after 5 starts`);
        }
      }
      // Prospect spot start: handled manually by commissioner/owner
    }
  }

  // Save assignments
  for (const assignment of assignments) {
    await db.query(`
      INSERT INTO sp_assignments (team_id, player_mlb_id, game_date, game_pk, assignment_type, is_mini_draft)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (team_id, game_date, game_pk) DO NOTHING
    `, [
      assignment.teamId, assignment.playerId, assignment.gameDate,
      assignment.gamePk, assignment.assignmentType, assignment.isMiniDraft,
    ]);
  }

  return assignments;
};

// ─────────────────────────────────────────────
// Full Lineup Builder
// ─────────────────────────────────────────────

/**
 * Build the optimal daily lineup for a team
 * MLB1 players start; if unavailable, MLB2 replaces; if still short, free agents fill
 */
const buildDailyLineup = async (teamId, date) => {
  // Get players in lineup for this date (playing in games)
  const playingToday = await getPlayersInLineupToday(date);
  const playingSet = new Set(playingToday);

  const lineup = [];

  // Process each hitter slot
  const hitterSlots = ['C', 'C', '1B', '2B', 'SS', '3B', 'INF', 'INF', 'OF', 'OF', 'OF', 'OF', 'UT', 'DH'];
  const usedPlayerIds = new Set();

  const { rows: mlb1Hitters } = await db.query(`
    SELECT rs.slot_type, rs.slot_number, mp.*
    FROM roster_slots rs
    JOIN mlb_players mp ON mp.mlb_id = rs.player_id
    WHERE rs.team_id = $1 AND rs.is_active = true AND rs.roster_level = 'MLB1'
    AND rs.slot_type NOT IN ('SP', 'RP', 'PROSPECT')
    ORDER BY rs.slot_number ASC
  `, [teamId]);

  const { rows: mlb2Hitters } = await db.query(`
    SELECT rs.slot_type, rs.slot_number, mp.*
    FROM roster_slots rs
    JOIN mlb_players mp ON mp.mlb_id = rs.player_id
    WHERE rs.team_id = $1 AND rs.is_active = true AND rs.roster_level = 'MLB2'
    AND rs.slot_type NOT IN ('SP', 'RP', 'PROSPECT')
    ORDER BY rs.slot_number ASC
  `, [teamId]);

  // Track slot_number per type: C1, C2, OF1-OF4, INF1/INF2 etc.
  const slotUsageCount = {};

  for (const slotEntry of hitterSlots) {
    // Increment slot counter for this type first
    slotUsageCount[slotEntry] = (slotUsageCount[slotEntry] || 0) + 1;
    const slotNumber = slotUsageCount[slotEntry];

    // Find MLB1 player for this slot who is playing today
    let selected = null;
    let isMlb2 = false;

    const eligibleMlb1 = mlb1Hitters.filter(
      (p) => !usedPlayerIds.has(p.mlb_id) &&
        playingSet.has(p.mlb_id) &&
        isEligibleForSlot(p, slotEntry)
    );

    if (eligibleMlb1.length > 0) {
      selected = eligibleMlb1[0];
    } else {
      // Try MLB2 replacement
      const eligibleMlb2 = mlb2Hitters.filter(
        (p) => !usedPlayerIds.has(p.mlb_id) &&
          playingSet.has(p.mlb_id) &&
          isEligibleForSlot(p, slotEntry)
      );
      if (eligibleMlb2.length > 0) {
        selected = eligibleMlb2[0];
        isMlb2 = true;
      }
    }

    if (selected) {
      usedPlayerIds.add(selected.mlb_id);
      lineup.push({
        teamId,
        lineupDate: date,
        slotType: slotEntry,
        slotNumber,
        playerMlbId: selected.mlb_id,
        isAutoSelected: true,
        isMlb2Replacement: isMlb2,
        isFreeAgentFill: false,
      });
    }
  }

  // Save lineup to DB — unique on (team_id, lineup_date, slot_type, slot_number)
  for (const slot of lineup) {
    await db.query(`
      INSERT INTO daily_lineups (team_id, lineup_date, slot_type, slot_number, player_mlb_id,
        is_auto_selected, is_mlb2_replacement, is_free_agent_fill)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (team_id, lineup_date, slot_type, slot_number) DO UPDATE SET
        player_mlb_id = EXCLUDED.player_mlb_id,
        is_mlb2_replacement = EXCLUDED.is_mlb2_replacement,
        updated_at = NOW()
    `, [
      slot.teamId, slot.lineupDate, slot.slotType, slot.slotNumber, slot.playerMlbId,
      slot.isAutoSelected, slot.isMlb2Replacement, slot.isFreeAgentFill,
    ]);
  }

  return lineup;
};

/**
 * Get all player IDs who are in game lineups for a given date
 */
const getPlayersInLineupToday = async (date) => {
  const games = await mlbApi.getSchedule(date);
  const playerIds = [];

  for (const game of games.slice(0, 5)) { // limit API calls
    try {
      const feed = await mlbApi.getLiveFeed(game.gamePk);
      const allPlayers = feed?.liveData?.boxscore?.teams;
      if (!allPlayers) continue;
      for (const side of ['home', 'away']) {
        for (const [, playerData] of Object.entries(allPlayers[side]?.players || {})) {
          if (playerData.person?.id) {
            playerIds.push(playerData.person.id);
          }
        }
      }
    } catch { /* skip */ }
  }

  return playerIds;
};

// ─────────────────────────────────────────────
// Free Agent Fill Logic
// ─────────────────────────────────────────────

/**
 * When a team can't fill their roster from MLB1/MLB2,
 * they can pick free agents — worst record fills first
 */
const triggerFreeAgentFill = async (date) => {
  // Get teams ordered by worst record (worst gets first pick)
  const { rows: teams } = await db.query(`
    SELECT t.*, ss.current_rank
    FROM teams t
    LEFT JOIN season_standings ss ON ss.team_id = t.id AND ss.season = 2026
    ORDER BY ss.current_rank DESC NULLS LAST
  `);

  for (const team of teams) {
    const { rows: emptySlots } = await db.query(`
      SELECT rs.slot_type, rs.slot_number FROM roster_slots rs
      WHERE rs.team_id = $1 AND rs.player_id IS NULL AND rs.is_active = true
      AND rs.slot_type NOT IN ('SP', 'RP', 'PROSPECT')
    `, [team.id]);

    if (emptySlots.length > 0) {
      console.log(`[Lineup] Team ${team.name} has ${emptySlots.length} empty slots eligible for FA fill`);
      // Commissioner/owner action required — logged as pending
      await db.query(`
        INSERT INTO activity_log (team_id, action_type, description, metadata)
        VALUES ($1, 'fa_fill_needed', $2, $3)
      `, [
        team.id,
        `Team has ${emptySlots.length} empty roster slots requiring free agent fill`,
        JSON.stringify({ emptySlots, date }),
      ]);
    }
  }
};

module.exports = {
  buildDailyLineup,
  selectSPsForDate,
  isEligibleForSlot,
  triggerFreeAgentFill,
  ROSTER_SLOTS,
  POSITION_ELIGIBLE,
};
