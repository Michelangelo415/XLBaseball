import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { getMe } from './utils/api';

// Pages
import LoginPage from './pages/LoginPage';
import CommissionerDashboard from './pages/CommissionerDashboard';
import StandingsPage from './pages/StandingsPage';
import TeamsPage from './pages/TeamsPage';
import TeamDetailPage from './pages/TeamDetailPage';
import TradesPage from './pages/TradesPage';
import ProspectsPage from './pages/ProspectsPage';
import ScoringPage from './pages/ScoringPage';
import PlayerSearchPage from './pages/PlayerSearchPage';
import ImportPage from './pages/ImportPage';

// ─────────────────────────────────────────────
// Auth Context
// ─────────────────────────────────────────────
export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getMe()
        .then((res) => {
          setUser(res.data.user);
          setTeam(res.data.team);
        })
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setTeam(null);
  };

  return (
    <AuthContext.Provider value={{ user, team, setUser, setTeam, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─────────────────────────────────────────────
// Route Guards
// ─────────────────────────────────────────────
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  return user ? children : <Navigate to="/login" />;
};

const CommissionerRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'commissioner') return <Navigate to="/standings" />;
  return children;
};

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><Navigate to="/dashboard" /></PrivateRoute>} />
          <Route path="/dashboard" element={<CommissionerRoute><CommissionerDashboard /></CommissionerRoute>} />
          <Route path="/standings" element={<PrivateRoute><StandingsPage /></PrivateRoute>} />
          <Route path="/teams" element={<PrivateRoute><TeamsPage /></PrivateRoute>} />
          <Route path="/teams/:teamId" element={<PrivateRoute><TeamDetailPage /></PrivateRoute>} />
          <Route path="/trades" element={<PrivateRoute><TradesPage /></PrivateRoute>} />
          <Route path="/prospects" element={<PrivateRoute><ProspectsPage /></PrivateRoute>} />
          <Route path="/scoring" element={<PrivateRoute><ScoringPage /></PrivateRoute>} />
          <Route path="/players" element={<PrivateRoute><PlayerSearchPage /></PrivateRoute>} />
          <Route path="/import" element={<CommissionerRoute><ImportPage /></CommissionerRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
