const db = require('../db');
const mlbApi = require('./mlbApi');

// ─────────────────────────────────────────────
// Scoring Rules
// ─────────────────────────────────────────────

const BATTING_SCORING = {
  single: 1,
  double: 2,
  triple: 3,
  home_run: 4,
  walk: 1,
  hbp: 1,
  gidp: -1,
  rbi: 1,
  stolen_base: 1,
  caught_stealing: -1,
};

const PITCHING_SCORING = {
  out_recorded: 1,
  hit_allowed: -1,
  earned_run: -2,
  walk_allowed: -1,
  strikeout: 1,
  save: 2,
};

/**
 * Calculate batting fantasy points for a stat line
 */
const calcBattingPoints = (stats) => {
  const singles = stats.hits - stats.doubles - stats.triples - stats.homeRuns;
  let pts = 0;
  pts += Math.max(0, singles) * BATTING_SCORING.single;
  pts += stats.doubles * BATTING_SCORING.double;
  pts += stats.triples * BATTING_SCORING.triple;
  pts += stats.homeRuns * BATTING_SCORING.home_run;
  pts += stats.baseOnBalls * BATTING_SCORING.walk;
  pts += stats.hitByPitch * BATTING_SCORING.hbp;
  pts += stats.groundIntoDoublePlay * BATTING_SCORING.gidp;
  pts += stats.rbi * BATTING_SCORING.rbi;
  pts += stats.stolenBases * BATTING_SCORING.stolen_base;
  pts += stats.caughtStealing * BATTING_SCORING.caught_stealing;
  return pts;
};

/**
 * Calculate pitching fantasy points
 * Relievers only get points if they appear in relief or pitch 3 innings or less
 */
const calcPitchingPoints = (stats, isStarter = false) => {
  // Reliever rule: only counts if appearing in relief OR <= 3 innings
  if (!isStarter && stats.inningsPitched > 3) {
    return 0;
  }

  let pts = 0;
  pts += stats.outsRecorded * PITCHING_SCORING.out_recorded;
  pts += stats.hits * PITCHING_SCORING.hit_allowed;
  pts += stats.earnedRuns * PITCHING_SCORING.earned_run;
  pts += stats.baseOnBalls * PITCHING_SCORING.walk_allowed;
  pts += stats.strikeOuts * PITCHING_SCORING.strikeout;
  pts += stats.saves * PITCHING_SCORING.save;
  return pts;
};

// ─────────────────────────────────────────────
// Daily Stat Pull
// ─────────────────────────────────────────────

/**
 * Pull all stats for a given date from MLB API and store them
 */
const pullDailyStats = async (date) => {
  console.log(`[Scoring] Pulling stats for ${date}`);
  const games = await mlbApi.getSchedule(date);
  const finalGames = games.filter((g) => g.status?.codedGameState === 'F');

  console.log(`[Scoring] ${finalGames.length} final games on ${date}`);

  for (const game of finalGames) {
    await pullGameStats(game.gamePk, date);
  }

  return finalGames.length;
};

/**
 * Pull stats for a single game
 */
const pullGameStats = async (gamePk, date) => {
  try {
    const feed = await mlbApi.getLiveFeed(gamePk);
    const players = feed?.liveData?.boxscore?.teams;
    if (!players) return;

    for (const side of ['home', 'away']) {
      const team = players[side];
      const teamId = feed.gameData?.teams?.[side]?.id;

      for (const [playerIdStr, playerData] of Object.entries(team.players || {})) {
        const mlbId = playerData.person?.id;
        if (!mlbId) continue;

        const position = playerData.position?.abbreviation;
        const ispitcher = ['P', 'SP', 'RP'].includes(position) ||
          (playerData.stats?.pitching?.inningsPitched != null);
        const isBatter = playerData.stats?.batting != null &&
          (playerData.stats.batting.atBats > 0 || playerData.stats.batting.plateAppearances > 0);

        if (isBatter) {
          const batting = mlbApi.extractBattingStats(playerData);
          const singles = batting.hits - batting.doubles - batting.triples - batting.homeRuns;
          const fantasyPts = calcBattingPoints(batting);

          await db.query(`
            INSERT INTO player_game_stats (
              player_mlb_id, game_date, game_pk, mlb_team_id, stat_type,
              at_bats, hits, singles, doubles, triples, home_runs, rbi,
              walks, strikeouts_batter, hbp, stolen_bases, caught_stealing,
              gidp, fantasy_points, raw_data
            ) VALUES ($1,$2,$3,$4,'batting',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
            ON CONFLICT (player_mlb_id, game_pk, stat_type) DO UPDATE SET
              fantasy_points = EXCLUDED.fantasy_points,
              raw_data = EXCLUDED.raw_data
          `, [
            mlbId, date, gamePk, teamId,
            batting.atBats, batting.hits, Math.max(0, singles),
            batting.doubles, batting.triples, batting.homeRuns, batting.rbi,
            batting.baseOnBalls, batting.strikeOuts, batting.hitByPitch,
            batting.stolenBases, batting.caughtStealing, batting.groundIntoDoublePlay,
            fantasyPts, JSON.stringify(playerData.stats?.batting),
          ]);
        }

        if (ispitcher && playerData.stats?.pitching) {
          const pitching = mlbApi.extractPitchingStats(playerData);
          const gamesStarted = playerData.stats.pitching.gamesStarted > 0;
          const fantasyPts = calcPitchingPoints(pitching, gamesStarted);

          await db.query(`
            INSERT INTO player_game_stats (
              player_mlb_id, game_date, game_pk, mlb_team_id, stat_type,
              outs_recorded, hits_allowed, earned_runs, walks_allowed,
              strikeouts_pitcher, saves, innings_pitched, games_started,
              fantasy_points, raw_data
            ) VALUES ($1,$2,$3,$4,'pitching',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (player_mlb_id, game_pk, stat_type) DO UPDATE SET
              fantasy_points = EXCLUDED.fantasy_points,
              raw_data = EXCLUDED.raw_data
          `, [
            mlbId, date, gamePk, teamId,
            pitching.outsRecorded, pitching.hits, pitching.earnedRuns,
            pitching.baseOnBalls, pitching.strikeOuts, pitching.saves,
            pitching.inningsPitched, gamesStarted,
            fantasyPts, JSON.stringify(playerData.stats?.pitching),
          ]);
        }
      }
    }
    console.log(`[Scoring] Stored stats for game ${gamePk}`);
  } catch (err) {
    console.error(`[Scoring] Error pulling game ${gamePk}:`, err.message);
  }
};

// ─────────────────────────────────────────────
// Team Scoring
// ─────────────────────────────────────────────

/**
 * Calculate fantasy points for all teams on a given date
 * Applies lineup rules, MLB1/MLB2 replacement logic
 */
const scoreTeamsForDate = async (date) => {
  console.log(`[Scoring] Scoring teams for ${date}`);

  // Check if <20 MLB teams played — if so, combine with next day
  const games = await mlbApi.getSchedule(date);
  const finalGames = games.filter((g) => g.status?.codedGameState === 'F');
  const teamsInAction = new Set();
  for (const g of finalGames) {
    teamsInAction.add(g.teams?.home?.team?.id);
    teamsInAction.add(g.teams?.away?.team?.id);
  }

  const shouldCombine = teamsInAction.size < 20;
  if (shouldCombine) {
    console.log(`[Scoring] Only ${teamsInAction.size} MLB teams in action on ${date} — will combine with next day`);
    await db.query(`
      UPDATE daily_team_scores SET is_combined_day = true
      WHERE score_date = $1
    `, [date]);
  }

  // Get all fantasy teams
  const { rows: fantasyTeams } = await db.query('SELECT * FROM teams WHERE season = $1', [2026]);

  const teamDayScores = [];

  for (const team of fantasyTeams) {
    const score = await scoreTeamForDate(team, date);
    teamDayScores.push({ team, score });
  }

  // Assign rank-based points
  // Sort teams by fantasy points descending
  teamDayScores.sort((a, b) => b.score.totalPoints - a.score.totalPoints);

  // Apply tiebreakers: 1) most saves, 2) most HRs, 3) SP point total
  teamDayScores.sort((a, b) => {
    if (b.score.totalPoints !== a.score.totalPoints) return b.score.totalPoints - a.score.totalPoints;
    if (b.score.saves !== a.score.saves) return b.score.saves - a.score.saves;
    if (b.score.homeRuns !== a.score.homeRuns) return b.score.homeRuns - a.score.homeRuns;
    return b.score.spPoints - a.score.spPoints;
  });

  const numTeams = fantasyTeams.length;

  for (let rank = 0; rank < teamDayScores.length; rank++) {
    const { team, score } = teamDayScores[rank];
    // Top team beats (numTeams - 1) teams, rank points = teams beaten
    const rankPoints = numTeams - 1 - rank;

    await db.query(`
      INSERT INTO daily_team_scores (
        team_id, score_date, fantasy_points, rank_points, rank,
        games_counted, is_combined_day, lineup_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (team_id, score_date) DO UPDATE SET
        fantasy_points = EXCLUDED.fantasy_points,
        rank_points = EXCLUDED.rank_points,
        rank = EXCLUDED.rank,
        is_combined_day = EXCLUDED.is_combined_day
    `, [
      team.id, date, score.totalPoints, rankPoints, rank + 1,
      score.gamesCount, shouldCombine, JSON.stringify(score.lineup),
    ]);
  }

  // Update season standings
  await updateStandings();

  console.log(`[Scoring] Completed scoring for ${date}`);
  return teamDayScores;
};

/**
 * Score a single fantasy team for a date
 */
const scoreTeamForDate = async (team, date) => {
  let totalPoints = 0;
  let saves = 0;
  let homeRuns = 0;
  let spPoints = 0;
  let gamesCount = 0;
  const lineup = [];

  // Get this team's daily lineup
  const { rows: lineupSlots } = await db.query(`
    SELECT dl.*, mp.primary_position, mp.full_name
    FROM daily_lineups dl
    JOIN mlb_players mp ON mp.mlb_id = dl.player_mlb_id
    WHERE dl.team_id = $1 AND dl.lineup_date = $2
  `, [team.id, date]);

  for (const slot of lineupSlots) {
    // Get player stats for this date
    const { rows: stats } = await db.query(`
      SELECT * FROM player_game_stats
      WHERE player_mlb_id = $1 AND game_date = $2
    `, [slot.player_mlb_id, date]);

    let playerPoints = 0;
    for (const stat of stats) {
      playerPoints += parseFloat(stat.fantasy_points);
      if (stat.stat_type === 'batting') homeRuns += stat.home_runs;
      if (stat.stat_type === 'pitching') saves += stat.saves;
    }

    const isSpSlot = slot.slot_type === 'SP';
    if (isSpSlot) spPoints += playerPoints;
    totalPoints += playerPoints;
    if (stats.length > 0) gamesCount++;

    lineup.push({
      slot: slot.slot_type,
      player: slot.full_name,
      playerId: slot.player_mlb_id,
      points: playerPoints,
    });
  }

  return { totalPoints, saves, homeRuns, spPoints, gamesCount, lineup };
};

/**
 * Update season standings from daily scores
 */
const updateStandings = async () => {
  await db.query(`
    INSERT INTO season_standings (team_id, season, total_rank_points, total_fantasy_points,
      total_saves, total_home_runs, total_sp_points, last_updated)
    SELECT
      t.id,
      2026,
      COALESCE(SUM(dts.rank_points), 0),
      COALESCE(SUM(dts.fantasy_points), 0),
      COALESCE((
        SELECT SUM(pgs.saves) FROM player_game_stats pgs
        JOIN daily_lineups dl ON dl.player_mlb_id = pgs.player_mlb_id
        WHERE dl.team_id = t.id AND pgs.stat_type = 'pitching'
      ), 0),
      COALESCE((
        SELECT SUM(pgs.home_runs) FROM player_game_stats pgs
        JOIN daily_lineups dl ON dl.player_mlb_id = pgs.player_mlb_id
        WHERE dl.team_id = t.id AND pgs.stat_type = 'batting'
      ), 0),
      COALESCE((
        SELECT SUM(pgs.fantasy_points) FROM player_game_stats pgs
        JOIN daily_lineups dl ON dl.player_mlb_id = pgs.player_mlb_id
        JOIN roster_slots rs ON rs.player_id = pgs.player_mlb_id AND rs.team_id = t.id
        WHERE rs.slot_type = 'SP' AND pgs.stat_type = 'pitching'
      ), 0),
      NOW()
    FROM teams t
    LEFT JOIN daily_team_scores dts ON dts.team_id = t.id
    WHERE t.season = 2026
    GROUP BY t.id
    ON CONFLICT (team_id, season) DO UPDATE SET
      total_rank_points = EXCLUDED.total_rank_points,
      total_fantasy_points = EXCLUDED.total_fantasy_points,
      total_saves = EXCLUDED.total_saves,
      total_home_runs = EXCLUDED.total_home_runs,
      total_sp_points = EXCLUDED.total_sp_points,
      last_updated = NOW()
  `);

  // Set ranks with tiebreakers
  await db.query(`
    WITH ranked AS (
      SELECT id, team_id,
        ROW_NUMBER() OVER (
          ORDER BY total_rank_points DESC, total_saves DESC,
          total_home_runs DESC, total_sp_points DESC
        ) AS rk
      FROM season_standings WHERE season = 2026
    )
    UPDATE season_standings ss SET current_rank = r.rk
    FROM ranked r WHERE ss.id = r.id
  `);
};

module.exports = {
  pullDailyStats,
  pullGameStats,
  scoreTeamsForDate,
  scoreTeamForDate,
  calcBattingPoints,
  calcPitchingPoints,
  updateStandings,
  BATTING_SCORING,
  PITCHING_SCORING,
};
