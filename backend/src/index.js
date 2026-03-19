require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

let apiRouter, registerJobs, pool;
try {
  apiRouter = require('./routes/api');
  console.log('[Startup] ✅ API router loaded');
} catch (err) {
  console.error('[Startup] ❌ Failed to load API router:', err.message);
  console.error(err.stack);
  process.exit(1);
}
try {
  ({ registerJobs } = require('./jobs/scheduler'));
} catch (err) {
  console.error('[Startup] ❌ Failed to load scheduler:', err.message);
  process.exit(1);
}
try {
  ({ pool } = require('./db'));
} catch (err) {
  console.error('[Startup] ❌ Failed to load DB:', err.message);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4000;

// ─────────────────────────────────────────────
// Auto migrate + seed on first deploy
// ─────────────────────────────────────────────
async function runMigrationsIfNeeded() {
  if (process.env.RUN_MIGRATIONS !== 'true') return;
  console.log('[Startup] RUN_MIGRATIONS=true — running schema migration...');
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('[Startup] ✅ Schema applied');
  } catch (err) {
    console.error('[Startup] Migration error (may already exist):', err.message);
  }

  // Seed commissioner + teams
  try {
    const bcrypt = require('bcryptjs');
    const email = process.env.COMMISSIONER_EMAIL || 'commissioner@xlbaseball.com';
    const password = process.env.COMMISSIONER_PASSWORD || 'changeme123';
    const hash = await bcrypt.hash(password, 12);

    const { rows: comms } = await pool.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, 'Commissioner', 'commissioner')
      ON CONFLICT (email) DO UPDATE SET role = 'commissioner'
      RETURNING id
    `, [email, hash]);
    console.log(`[Startup] ✅ Commissioner ready: ${email}`);

    const teams = [
      { name: 'Team 1', abbr: 'TM1', ownerEmail: 'team1@xlbaseball.com', ownerName: 'Owner 1' },
      { name: 'Team 2', abbr: 'TM2', ownerEmail: 'team2@xlbaseball.com', ownerName: 'Owner 2' },
      { name: 'Team 3', abbr: 'TM3', ownerEmail: 'team3@xlbaseball.com', ownerName: 'Owner 3' },
      { name: 'Team 4', abbr: 'TM4', ownerEmail: 'team4@xlbaseball.com', ownerName: 'Owner 4' },
      { name: 'Team 5', abbr: 'TM5', ownerEmail: 'team5@xlbaseball.com', ownerName: 'Owner 5' },
      { name: 'Team 6', abbr: 'TM6', ownerEmail: 'team6@xlbaseball.com', ownerName: 'Owner 6' },
    ];

    for (const t of teams) {
      const ownerHash = await bcrypt.hash('temppass123', 12);
      const { rows: owners } = await pool.query(`
        INSERT INTO users (email, password_hash, name, role)
        VALUES ($1, $2, $3, 'owner')
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [t.ownerEmail, ownerHash, t.ownerName]);

      const { rows: teamRows } = await pool.query(`
        INSERT INTO teams (owner_id, name, abbreviation, season)
        VALUES ($1, $2, $3, 2026)
        ON CONFLICT (name, season) DO UPDATE SET owner_id = EXCLUDED.owner_id
        RETURNING id
      `, [owners[0].id, t.name, t.abbr]);

      if (teamRows.length > 0) {
        await pool.query(`
          INSERT INTO season_standings (team_id, season) VALUES ($1, 2026) ON CONFLICT DO NOTHING
        `, [teamRows[0].id]);
      }
      console.log(`[Startup] ✅ Team "${t.name}" ready`);
    }
  } catch (err) {
    console.error('[Startup] Seed error:', err.message);
  }
}

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'https://xlbaseball-app.onrender.com',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.endsWith('.onrender.com')) return callback(null, true);
    callback(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.use('/api', apiRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
runMigrationsIfNeeded().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 XL Baseball API running on port ${PORT}`);
    if (process.env.NODE_ENV !== 'test') {
      registerJobs();
    }
  });
});
// XL Baseball 2026 - build 1773892392
