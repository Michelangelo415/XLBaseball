const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const JWT_EXPIRES = '7d';

// ─────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
};

const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (!rows.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireCommissioner = (req, res, next) => {
  if (req.user?.role !== 'commissioner') {
    return res.status(403).json({ error: 'Commissioner access required' });
  }
  next();
};

const requireTeamOwner = async (req, res, next) => {
  if (req.user?.role === 'commissioner') return next(); // commissioners can access all teams

  const teamId = req.params.teamId || req.body.teamId;
  if (!teamId) return res.status(400).json({ error: 'Team ID required' });

  const { rows } = await db.query('SELECT * FROM teams WHERE id = $1 AND owner_id = $2', [
    teamId, req.user.id,
  ]);

  if (!rows.length) {
    return res.status(403).json({ error: 'You do not own this team' });
  }

  req.team = rows[0];
  next();
};

// ─────────────────────────────────────────────
// Auth routes handler (login/register)
// ─────────────────────────────────────────────

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!rows.length) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Get associated team
  const { rows: teams } = await db.query(
    'SELECT * FROM teams WHERE owner_id = $1 AND season = 2025', [user.id]
  );

  const token = generateToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    team: teams[0] || null,
  });
};

const register = async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name required' });
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    const { rows } = await db.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, 'owner')
      RETURNING id, email, name, role
    `, [email.toLowerCase(), hash, name]);

    const token = generateToken(rows[0]);
    res.status(201).json({ token, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
};

module.exports = {
  authenticate,
  requireCommissioner,
  requireTeamOwner,
  login,
  register,
  generateToken,
  bcrypt,
};
