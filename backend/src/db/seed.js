require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./index');

async function seed() {
  console.log('Seeding database...');

  // Create commissioner
  const hash = await bcrypt.hash(process.env.COMMISSIONER_PASSWORD || 'changeme123', 12);
  const { rows: commissioners } = await pool.query(`
    INSERT INTO users (email, password_hash, name, role)
    VALUES ($1, $2, 'Commissioner', 'commissioner')
    ON CONFLICT (email) DO UPDATE SET role = 'commissioner'
    RETURNING id
  `, [process.env.COMMISSIONER_EMAIL || 'commissioner@league.com', hash]);

  const commId = commissioners[0].id;
  console.log(`✅ Commissioner created: ${process.env.COMMISSIONER_EMAIL || 'commissioner@league.com'}`);
  console.log(`   Password: ${process.env.COMMISSIONER_PASSWORD || 'changeme123'}`);

  // Create 6 placeholder team owners + teams
  const teams = [
    { name: 'Team Alpha', abbr: 'ALP', ownerEmail: 'alpha@league.com', ownerName: 'Owner Alpha' },
    { name: 'Team Bravo', abbr: 'BRV', ownerEmail: 'bravo@league.com', ownerName: 'Owner Bravo' },
    { name: 'Team Charlie', abbr: 'CHL', ownerEmail: 'charlie@league.com', ownerName: 'Owner Charlie' },
    { name: 'Team Delta', abbr: 'DLT', ownerEmail: 'delta@league.com', ownerName: 'Owner Delta' },
    { name: 'Team Echo', abbr: 'ECH', ownerEmail: 'echo@league.com', ownerName: 'Owner Echo' },
    { name: 'Team Foxtrot', abbr: 'FXT', ownerEmail: 'foxtrot@league.com', ownerName: 'Owner Foxtrot' },
  ];

  for (const t of teams) {
    const ownerHash = await bcrypt.hash('temppass123', 12);
    const { rows: owners } = await pool.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, 'owner')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [t.ownerEmail, ownerHash, t.ownerName]);

    const ownerId = owners[0].id;

    const { rows: teamRows } = await pool.query(`
      INSERT INTO teams (owner_id, name, abbreviation, season)
      VALUES ($1, $2, $3, 2025)
      ON CONFLICT (name, season) DO UPDATE SET owner_id = EXCLUDED.owner_id
      RETURNING id
    `, [ownerId, t.name, t.abbr]);

    if (teamRows.length > 0) {
      await pool.query(`
        INSERT INTO season_standings (team_id, season) VALUES ($1, 2025) ON CONFLICT DO NOTHING
      `, [teamRows[0].id]);
    }

    console.log(`✅ Team "${t.name}" created (owner: ${t.ownerEmail} / temppass123)`);
  }

  console.log('\n🎉 Seed complete. Update team owner passwords on first login!');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
