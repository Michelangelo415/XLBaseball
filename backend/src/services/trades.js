const db = require('../db');
const { format } = require('date-fns');

/**
 * Propose a trade between two teams
 * @param {string} proposingTeamId
 * @param {string} receivingTeamId
 * @param {Array} assetsFrom - [{playerMlbId, assetType}] from proposing team
 * @param {Array} assetsTo - [{playerMlbId, assetType}] from receiving team
 */
const proposeTrade = async (proposingTeamId, receivingTeamId, assetsFrom, assetsTo, notes = '') => {
  // Check trade deadline
  const { rows: settings } = await db.query('SELECT trade_deadline FROM league_settings WHERE season = 2026');
  if (settings.length) {
    const deadline = new Date(settings[0].trade_deadline);
    if (new Date() > deadline) {
      throw new Error('Trade deadline has passed (August 15)');
    }
  }

  // Verify all players are owned by proposing team
  for (const asset of assetsFrom) {
    const { rows } = await db.query(`
      SELECT * FROM roster_slots
      WHERE team_id = $1 AND player_id = $2 AND is_active = true
    `, [proposingTeamId, asset.playerMlbId]);
    if (!rows.length) {
      throw new Error(`Player ${asset.playerMlbId} is not on proposing team's roster`);
    }
  }

  // Verify receiving team's assets
  for (const asset of assetsTo) {
    const { rows } = await db.query(`
      SELECT * FROM roster_slots
      WHERE team_id = $1 AND player_id = $2 AND is_active = true
    `, [receivingTeamId, asset.playerMlbId]);
    if (!rows.length) {
      throw new Error(`Player ${asset.playerMlbId} is not on receiving team's roster`);
    }
  }

  // Create trade
  const { rows: tradeRows } = await db.query(`
    INSERT INTO trades (proposing_team_id, receiving_team_id, notes, season)
    VALUES ($1, $2, $3, 2026)
    RETURNING *
  `, [proposingTeamId, receivingTeamId, notes]);
  const trade = tradeRows[0];

  // Add assets
  for (const asset of assetsFrom) {
    await db.query(`
      INSERT INTO trade_assets (trade_id, from_team_id, to_team_id, player_mlb_id, asset_type)
      VALUES ($1, $2, $3, $4, $5)
    `, [trade.id, proposingTeamId, receivingTeamId, asset.playerMlbId, asset.assetType || 'player']);
  }

  for (const asset of assetsTo) {
    await db.query(`
      INSERT INTO trade_assets (trade_id, from_team_id, to_team_id, player_mlb_id, asset_type)
      VALUES ($1, $2, $3, $4, $5)
    `, [trade.id, receivingTeamId, proposingTeamId, asset.playerMlbId, asset.assetType || 'player']);
  }

  // Log
  await db.query(`
    INSERT INTO activity_log (team_id, action_type, description, metadata)
    VALUES ($1, 'trade_proposed', 'Trade proposed', $2)
  `, [proposingTeamId, JSON.stringify({ tradeId: trade.id })]);

  return trade;
};

/**
 * Accept a trade (receiving team accepts)
 * Moves players to new teams, needs commissioner approval
 */
const acceptTrade = async (tradeId, receivingTeamId) => {
  const { rows: trades } = await db.query('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trades.length) throw new Error('Trade not found');
  const trade = trades[0];

  if (trade.receiving_team_id !== receivingTeamId) {
    throw new Error('Only the receiving team can accept this trade');
  }

  if (trade.status !== 'pending') {
    throw new Error(`Trade is not pending (current status: ${trade.status})`);
  }

  // Flag for commissioner review
  await db.query(`
    UPDATE trades SET status = 'commissioner_review', responded_at = NOW()
    WHERE id = $1
  `, [tradeId]);

  await db.query(`
    INSERT INTO activity_log (team_id, action_type, description)
    VALUES ($1, 'trade_accepted_pending_review', 'Trade accepted — awaiting commissioner approval')
  `, [receivingTeamId]);

  return { status: 'commissioner_review', tradeId };
};

/**
 * Commissioner approves and executes a trade
 */
const approveTrade = async (tradeId) => {
  const { rows: trades } = await db.query('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trades.length) throw new Error('Trade not found');
  const trade = trades[0];

  if (!['commissioner_review', 'pending'].includes(trade.status)) {
    throw new Error('Trade cannot be approved in current state');
  }

  const { rows: assets } = await db.query(
    'SELECT * FROM trade_assets WHERE trade_id = $1', [tradeId]
  );

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    for (const asset of assets) {
      // Move player from from_team to to_team
      await client.query(`
        UPDATE roster_slots
        SET team_id = $1, acquired_via = 'trade', acquired_date = CURRENT_DATE
        WHERE team_id = $2 AND player_id = $3 AND is_active = true
      `, [asset.to_team_id, asset.from_team_id, asset.player_mlb_id]);

      // If prospect, transfer prospect rights too
      await client.query(`
        UPDATE prospect_rights SET team_id = $1
        WHERE team_id = $2 AND player_mlb_id = $3 AND season = 2026
      `, [asset.to_team_id, asset.from_team_id, asset.player_mlb_id]);
    }

    await client.query(`
      UPDATE trades
      SET status = 'accepted', commissioner_approved = true, completed_at = NOW()
      WHERE id = $1
    `, [tradeId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await db.query(`
    INSERT INTO activity_log (action_type, description, metadata)
    VALUES ('trade_completed', 'Commissioner approved and executed trade', $1)
  `, [JSON.stringify({ tradeId })]);

  return { status: 'completed', tradeId };
};

/**
 * Reject or veto a trade
 */
const rejectTrade = async (tradeId, reason = '') => {
  await db.query(`
    UPDATE trades SET status = 'rejected', responded_at = NOW(), notes = $2
    WHERE id = $1
  `, [tradeId, reason]);

  return { status: 'rejected', tradeId };
};

/**
 * Get all pending trades (for commissioner dashboard)
 */
const getPendingTrades = async () => {
  const { rows } = await db.query(`
    SELECT t.*,
      pt.name as proposing_team_name,
      rt.name as receiving_team_name,
      json_agg(DISTINCT jsonb_build_object(
        'from_team_id', ta.from_team_id,
        'to_team_id', ta.to_team_id,
        'player_mlb_id', ta.player_mlb_id,
        'player_name', mp.full_name,
        'asset_type', ta.asset_type
      )) as assets
    FROM trades t
    JOIN teams pt ON pt.id = t.proposing_team_id
    JOIN teams rt ON rt.id = t.receiving_team_id
    LEFT JOIN trade_assets ta ON ta.trade_id = t.id
    LEFT JOIN mlb_players mp ON mp.mlb_id = ta.player_mlb_id
    WHERE t.status IN ('pending', 'commissioner_review')
    GROUP BY t.id, pt.name, rt.name
    ORDER BY t.proposed_at DESC
  `);
  return rows;
};

module.exports = {
  proposeTrade,
  acceptTrade,
  approveTrade,
  rejectTrade,
  getPendingTrades,
};
