const db = require('../db');
const mlbApi = require('./mlbApi');

/**
 * Check all prospects and update veteran status
 * A player "reaches veteran status" when they appear on an active MLB roster
 */
const checkProspectStatus = async () => {
  const { rows: prospects } = await db.query(`
    SELECT pr.*, mp.full_name, mp.mlb_id, mp.mlb_team_id, mp.status
    FROM prospect_rights pr
    JOIN mlb_players mp ON mp.mlb_id = pr.player_mlb_id
    WHERE pr.status = 'prospect' AND pr.season = 2026
  `);

  for (const prospect of prospects) {
    // Check if player is now on active MLB roster
    if (prospect.mlb_team_id) {
      const roster = await mlbApi.getTeamRoster(prospect.mlb_team_id);
      const isOnRoster = roster.some((p) => p.person?.id === prospect.player_mlb_id);

      if (isOnRoster) {
        await handleProspectCalledUp(prospect);
      }
    }
  }
};

/**
 * Handle when a prospect reaches MLB veteran status
 * Team with rights has first right to activate, with deadline
 * If they pass, player becomes free agent
 */
const handleProspectCalledUp = async (prospect) => {
  if (prospect.veteran_notification_date) return; // already notified

  const decisionDeadline = new Date();
  decisionDeadline.setDate(decisionDeadline.getDate() + 3); // 3-day window

  await db.query(`
    UPDATE prospect_rights
    SET veteran_notification_date = CURRENT_DATE, decision_deadline = $1, status = 'called_up'
    WHERE id = $2
  `, [decisionDeadline.toISOString().split('T')[0], prospect.id]);

  // Mark player as no longer prospect eligible
  await db.query(`
    UPDATE mlb_players SET is_prospect = false WHERE mlb_id = $1
  `, [prospect.player_mlb_id]);

  // Log notification
  await db.query(`
    INSERT INTO activity_log (team_id, action_type, description, metadata)
    VALUES ($1, 'prospect_veteran_status', $2, $3)
  `, [
    prospect.team_id,
    `${prospect.full_name} has reached veteran status. Decision deadline: ${decisionDeadline.toDateString()}`,
    JSON.stringify({ prospectId: prospect.id, deadline: decisionDeadline }),
  ]);

  console.log(`[Prospects] ${prospect.full_name} reached veteran status. Team notified.`);
};

/**
 * Commissioner activates a prospect to active roster
 */
const activateProspect = async (teamId, playerMlbId, slotType) => {
  const { rows: rights } = await db.query(`
    SELECT * FROM prospect_rights
    WHERE team_id = $1 AND player_mlb_id = $2 AND season = 2026
  `, [teamId, playerMlbId]);

  if (!rights.length) {
    throw new Error('Team does not have prospect rights for this player');
  }

  const right = rights[0];

  if (right.status === 'became_fa') {
    throw new Error('Player has already become a free agent');
  }

  // Move player from prospect slot to active roster slot
  await db.query(`
    UPDATE roster_slots
    SET slot_type = $1, roster_level = 'MLB1', is_active = true
    WHERE team_id = $2 AND player_id = $3 AND slot_type = 'PROSPECT'
  `, [slotType, teamId, playerMlbId]);

  // Remove prospect slot
  await db.query(`
    DELETE FROM roster_slots
    WHERE team_id = $1 AND player_id = $2 AND slot_type = 'PROSPECT'
  `, [teamId, playerMlbId]);

  // Update rights
  await db.query(`
    UPDATE prospect_rights
    SET status = 'activated', activated_date = CURRENT_DATE
    WHERE team_id = $1 AND player_mlb_id = $2 AND season = 2026
  `, [teamId, playerMlbId]);

  // Log
  await db.query(`
    INSERT INTO activity_log (team_id, action_type, description)
    VALUES ($1, 'prospect_activated', $2)
  `, [teamId, `Prospect activated to ${slotType} slot`]);
};

/**
 * Team passes on activating prospect — player becomes free agent
 */
const releaseProspectToFreeAgency = async (teamId, playerMlbId) => {
  // Remove from roster
  await db.query(`
    DELETE FROM roster_slots
    WHERE team_id = $1 AND player_id = $2 AND slot_type = 'PROSPECT'
  `, [teamId, playerMlbId]);

  // Update rights status
  await db.query(`
    UPDATE prospect_rights SET status = 'became_fa'
    WHERE team_id = $1 AND player_mlb_id = $2 AND season = 2026
  `, [teamId, playerMlbId]);

  await db.query(`
    INSERT INTO activity_log (team_id, action_type, description)
    VALUES ($1, 'prospect_released_to_fa', 'Team passed on activating prospect — now free agent')
  `, [teamId]);
};

/**
 * Check for expired prospect decision deadlines and auto-release
 */
const processExpiredProspectDeadlines = async () => {
  const { rows: expired } = await db.query(`
    SELECT pr.*, t.name as team_name, mp.full_name
    FROM prospect_rights pr
    JOIN teams t ON t.id = pr.team_id
    JOIN mlb_players mp ON mp.mlb_id = pr.player_mlb_id
    WHERE pr.status = 'called_up'
    AND pr.decision_deadline < CURRENT_DATE
    AND pr.activated_date IS NULL
  `);

  for (const exp of expired) {
    console.log(`[Prospects] Deadline expired for ${exp.full_name} — releasing to FA`);
    await releaseProspectToFreeAgency(exp.team_id, exp.player_mlb_id);
  }

  return expired.length;
};

module.exports = {
  checkProspectStatus,
  handleProspectCalledUp,
  activateProspect,
  releaseProspectToFreeAgency,
  processExpiredProspectDeadlines,
};
