import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401s
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────
export const login = (email, password) => api.post('/auth/login', { email, password });
export const getMe = () => api.get('/auth/me');

// ─────────────────────────────────────────────
// League
// ─────────────────────────────────────────────
export const getStandings = () => api.get('/league/standings');
export const getSettings = () => api.get('/league/settings');
export const getActivity = (limit = 50) => api.get(`/league/activity?limit=${limit}`);

// ─────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────
export const getTeams = () => api.get('/teams');
export const getTeam = (teamId) => api.get(`/teams/${teamId}`);
export const getTeamRoster = (teamId) => api.get(`/teams/${teamId}/roster`);
export const getTeamLineup = (teamId, date) => api.get(`/teams/${teamId}/lineup/${date}`);
export const getTeamScores = (teamId, limit) => api.get(`/teams/${teamId}/scores?limit=${limit || 30}`);
export const createTeam = (data) => api.post('/teams', data);

// ─────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────
export const searchPlayers = (params) => api.get('/players/search', { params });
export const getPlayer = (mlbId) => api.get(`/players/${mlbId}`);
export const getPlayerStats = (mlbId, season) => api.get(`/players/${mlbId}/stats?season=${season || 2025}`);

// ─────────────────────────────────────────────
// Roster
// ─────────────────────────────────────────────
export const addPlayerToRoster = (data) => api.post('/roster/add', data);
export const dropPlayer = (data) => api.post('/roster/drop', data);
export const convertRPtoSP = (data) => api.post('/roster/convert-rp-to-sp', data);

// ─────────────────────────────────────────────
// Trades
// ─────────────────────────────────────────────
export const getTrades = (status) => api.get(`/trades${status ? `?status=${status}` : ''}`);
export const getPendingTrades = () => api.get('/trades/pending');
export const proposeTrade = (data) => api.post('/trades/propose', data);
export const acceptTrade = (tradeId, teamId) => api.post(`/trades/${tradeId}/accept`, { teamId });
export const approveTrade = (tradeId) => api.post(`/trades/${tradeId}/approve`);
export const rejectTrade = (tradeId, reason) => api.post(`/trades/${tradeId}/reject`, { reason });

// ─────────────────────────────────────────────
// Prospects
// ─────────────────────────────────────────────
export const getProspects = () => api.get('/prospects');
export const activateProspect = (data) => api.post('/prospects/activate', data);
export const releaseProspect = (data) => api.post('/prospects/release', data);

// ─────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────
export const getDailyScores = (date) => api.get(`/scoring/daily/${date}`);
export const runScoring = (date) => api.post(`/scoring/run/${date}`);
export const pullStats = (date) => api.post(`/scoring/pull/${date}`);

// ─────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────
export const syncPlayers = () => api.post('/admin/sync-players');
export const checkProspects = () => api.post('/admin/check-prospects');
export const importRosters = (spreadsheetId) => api.post('/import/rosters', { spreadsheetId });
export const downloadTemplate = () => `${BASE_URL}/import/template`;

export default api;
