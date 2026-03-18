const { google } = require('googleapis');
const db = require('../db');

/**
 * Import rosters from Google Sheets
 *
 * Expected sheet format (one sheet per team or all on one sheet):
 * Column A: Team Name
 * Column B: Player Name
 * Column C: Slot Type (SP, RP, C, 1B, 2B, SS, 3B, INF, OF, UT, DH, PROSPECT)
 * Column D: Roster Level (MLB1, MLB2, PROSPECT)
 * Column E: MLB ID (optional — if blank, we search by name)
 * Column F: Notes
 */

const getAuth = () => {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }
  // OAuth2 fallback
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
};

/**
 * Read all rows from a Google Sheet
 */
const readSheet = async (spreadsheetId, range = 'A:G') => {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return res.data.values || [];
};

/**
 * Main import function
 * Reads roster sheet and populates DB
 */
const importRostersFromSheet = async (spreadsheetId, season = 2025) => {
  const rows = await readSheet(spreadsheetId);
  if (!rows.length) throw new Error('No data found in sheet');

  const results = {
    teamsProcessed: 0,
    playersImported: 0,
    playersNotFound: [],
    errors: [],
  };

  // Skip header row
  const dataRows = rows.slice(1);

  // Group by team name
  const teamMap = {};
  for (const row of dataRows) {
    const [teamName, playerName, slotType, rosterLevel, mlbIdRaw, notes] = row;
    if (!teamName || !playerName) continue;

    if (!teamMap[teamName]) teamMap[teamName] = [];
    teamMap[teamName].push({
      playerName: playerName.trim(),
      slotType: (slotType || '').trim().toUpperCase(),
      rosterLevel: (rosterLevel || 'MLB1').trim().toUpperCase(),
      mlbId: mlbIdRaw ? parseInt(mlbIdRaw) : null,
      notes: notes || '',
    });
  }

  for (const [teamName, players] of Object.entries(teamMap)) {
    // Find or skip team
    const { rows: teamRows } = await db.query(
      'SELECT * FROM teams WHERE LOWER(name) = LOWER($1) AND season = $2',
      [teamName, season]
    );

    if (!teamRows.length) {
      results.errors.push(`Team not found: ${teamName}`);
      continue;
    }

    const team = teamRows[0];
    results.teamsProcessed++;

    // Process each player
    const slotCounts = {};

    for (const playerEntry of players) {
      try {
        let mlbId = playerEntry.mlbId;

        // Look up player if no MLB ID given
        if (!mlbId) {
          const { rows: existing } = await db.query(
            `SELECT mlb_id FROM mlb_players
             WHERE LOWER(full_name) LIKE LOWER($1)
             ORDER BY updated_at DESC LIMIT 1`,
            [`%${playerEntry.playerName}%`]
          );
          if (existing.length) {
            mlbId = existing[0].mlb_id;
          } else {
            results.playersNotFound.push({
              team: teamName,
              player: playerEntry.playerName,
            });
            continue;
          }
        }

        // Track slot numbering
        const slotKey = playerEntry.slotType;
        slotCounts[slotKey] = (slotCounts[slotKey] || 0) + 1;
        const slotNumber = slotCounts[slotKey];

        // Upsert roster slot
        await db.query(`
          INSERT INTO roster_slots (team_id, slot_type, slot_number, player_id, roster_level, season, acquired_via)
          VALUES ($1, $2, $3, $4, $5, $6, 'import')
          ON CONFLICT (team_id, slot_type, slot_number, season)
          DO UPDATE SET player_id = EXCLUDED.player_id, roster_level = EXCLUDED.roster_level
        `, [team.id, slotKey, slotNumber, mlbId, playerEntry.rosterLevel, season]);

        // If prospect, create prospect rights record
        if (playerEntry.rosterLevel === 'PROSPECT') {
          await db.query(`
            INSERT INTO prospect_rights (team_id, player_mlb_id, acquired_date, acquired_via, season)
            VALUES ($1, $2, CURRENT_DATE, 'import', $3)
            ON CONFLICT (player_mlb_id, season) DO NOTHING
          `, [team.id, mlbId, season]);
        }

        results.playersImported++;
      } catch (err) {
        results.errors.push(`Error importing ${playerEntry.playerName}: ${err.message}`);
      }
    }
  }

  console.log('[Import] Roster import complete:', results);
  return results;
};

/**
 * Get list of available sheets in a spreadsheet
 */
const getSheetNames = async (spreadsheetId) => {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return (res.data.sheets || []).map((s) => s.properties.title);
};

/**
 * Generate a template CSV that matches expected import format
 */
const generateImportTemplate = () => {
  const header = ['Team Name', 'Player Name', 'Slot Type', 'Roster Level', 'MLB ID (optional)', 'Notes'];
  const examples = [
    ['Team Bravo', 'Shohei Ohtani', 'DH', 'MLB1', '660271', ''],
    ['Team Bravo', 'Gerrit Cole', 'SP', 'MLB1', '543037', ''],
    ['Team Bravo', 'Jackson Holliday', 'PROSPECT', 'PROSPECT', '682998', 'Top prospect'],
    ['Team Alpha', 'Freddie Freeman', '1B', 'MLB1', '518692', ''],
  ];
  return [header, ...examples].map((r) => r.join(',')).join('\n');
};

module.exports = {
  importRostersFromSheet,
  readSheet,
  getSheetNames,
  generateImportTemplate,
};
