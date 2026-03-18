const axios = require('axios');

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const MLB_BASE_V11 = 'https://statsapi.mlb.com/api/v1.1';

// ─────────────────────────────────────────────
// Core fetcher
// ─────────────────────────────────────────────
const mlbFetch = async (path, params = {}) => {
  try {
    const res = await axios.get(`${MLB_BASE}${path}`, {
      params,
      timeout: 10000,
    });
    return res.data;
  } catch (err) {
    console.error(`MLB API error [${path}]:`, err.message);
    throw err;
  }
};

// ─────────────────────────────────────────────
// Schedule
// ─────────────────────────────────────────────

/**
 * Get all games for a given date
 * @param {string} date - YYYY-MM-DD
 */
const getSchedule = async (date) => {
  const data = await mlbFetch('/schedule', {
    sportId: 1,
    date,
    hydrate: 'probablePitcher,lineScore,flags',
  });
  return data.dates?.[0]?.games || [];
};

/**
 * Get schedule for a date range
 */
const getScheduleRange = async (startDate, endDate) => {
  const data = await mlbFetch('/schedule', {
    sportId: 1,
    startDate,
    endDate,
    hydrate: 'probablePitcher,lineScore,flags',
  });
  return data.dates || [];
};

// ─────────────────────────────────────────────
// Game Stats
// ─────────────────────────────────────────────

/**
 * Get box score for a specific game
 */
const getBoxScore = async (gamePk) => {
  const data = await mlbFetch(`/game/${gamePk}/boxscore`);
  return data;
};

/**
 * Get live feed for a game (includes all player stats)
 */
const getLiveFeed = async (gamePk) => {
  const res = await axios.get(`${MLB_BASE_V11}/game/${gamePk}/feed/live`, {
    timeout: 15000,
  });
  return res.data;
};

/**
 * Extract batting stats from live feed for a player
 */
const extractBattingStats = (playerData) => {
  const s = playerData?.stats?.batting || {};
  return {
    atBats: s.atBats || 0,
    hits: s.hits || 0,
    doubles: s.doubles || 0,
    triples: s.triples || 0,
    homeRuns: s.homeRuns || 0,
    rbi: s.rbi || 0,
    baseOnBalls: s.baseOnBalls || 0,
    strikeOuts: s.strikeOuts || 0,
    hitByPitch: s.hitByPitch || 0,
    stolenBases: s.stolenBases || 0,
    caughtStealing: s.caughtStealing || 0,
    groundIntoDoublePlay: s.groundIntoDoublePlay || 0,
  };
};

/**
 * Extract pitching stats from live feed for a player
 */
const extractPitchingStats = (playerData) => {
  const s = playerData?.stats?.pitching || {};
  const ip = parseFloat(s.inningsPitched || '0');
  // Convert partial innings: 0.1 IP = 1 out, 0.2 IP = 2 outs
  const fullInnings = Math.floor(ip);
  const partialOuts = Math.round((ip - fullInnings) * 10);
  const outsRecorded = fullInnings * 3 + partialOuts;

  return {
    inningsPitched: ip,
    outsRecorded,
    hits: s.hits || 0,
    earnedRuns: s.earnedRuns || 0,
    baseOnBalls: s.baseOnBalls || 0,
    strikeOuts: s.strikeOuts || 0,
    saves: s.saves || 0,
    gamesStarted: s.gamesStarted || 0,
    numberOfPitches: s.numberOfPitches || 0,
  };
};

// ─────────────────────────────────────────────
// Player Lookup
// ─────────────────────────────────────────────

/**
 * Search players by name
 */
const searchPlayers = async (name) => {
  const data = await mlbFetch('/people/search', {
    names: name,
    sportIds: 1,
  });
  return data.people || [];
};

/**
 * Get player details
 */
const getPlayer = async (mlbId) => {
  const data = await mlbFetch(`/people/${mlbId}`, {
    hydrate: 'currentTeam,stats(type=career),education',
  });
  return data.people?.[0] || null;
};

/**
 * Get player's position eligibility based on games played (last 3 years)
 */
const getPlayerPositionStats = async (mlbId, seasons = [2023, 2024, 2025]) => {
  const positionGames = {};

  for (const season of seasons) {
    try {
      const data = await mlbFetch(`/people/${mlbId}/stats`, {
        stats: 'gameLog',
        season,
        sportId: 1,
      });
      const games = data.stats?.[0]?.splits || [];
      for (const game of games) {
        const pos = game.position?.abbreviation;
        if (pos) {
          positionGames[pos] = (positionGames[pos] || 0) + 1;
        }
      }
    } catch {
      // Season may not have data
    }
  }

  return positionGames;
};

/**
 * Get all active MLB rosters
 */
const getAllRosters = async () => {
  const data = await mlbFetch('/teams', {
    sportId: 1,
    hydrate: 'roster(rosterType=active)',
    season: new Date().getFullYear(),
  });
  return data.teams || [];
};

/**
 * Get a team's active roster
 */
const getTeamRoster = async (mlbTeamId) => {
  const data = await mlbFetch(`/teams/${mlbTeamId}/roster`, {
    rosterType: 'active',
  });
  return data.roster || [];
};

/**
 * Get probable pitchers for upcoming dates
 */
const getProbablePitchers = async (date) => {
  const games = await getSchedule(date);
  const probables = [];

  for (const game of games) {
    if (game.teams?.home?.probablePitcher) {
      probables.push({
        gamePk: game.gamePk,
        date,
        team: 'home',
        teamId: game.teams.home.team.id,
        pitcher: game.teams.home.probablePitcher,
      });
    }
    if (game.teams?.away?.probablePitcher) {
      probables.push({
        gamePk: game.gamePk,
        date,
        team: 'away',
        teamId: game.teams.away.team.id,
        pitcher: game.teams.away.probablePitcher,
      });
    }
  }

  return probables;
};

module.exports = {
  getSchedule,
  getScheduleRange,
  getBoxScore,
  getLiveFeed,
  extractBattingStats,
  extractPitchingStats,
  searchPlayers,
  getPlayer,
  getPlayerPositionStats,
  getAllRosters,
  getTeamRoster,
  getProbablePitchers,
};
