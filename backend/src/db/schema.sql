-- ============================================================
-- FANTASY BASEBALL LEAGUE ENGINE - Database Schema
-- PostgreSQL
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS & TEAMS
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'owner' CHECK (role IN ('commissioner', 'owner')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  abbreviation VARCHAR(10) NOT NULL,
  logo_url VARCHAR(500),
  season INT NOT NULL DEFAULT 2025,
  total_fantasy_points DECIMAL(10,2) DEFAULT 0,
  season_rank INT,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, season)
);

-- ============================================================
-- MLB PLAYERS (synced from MLB API)
-- ============================================================

CREATE TABLE mlb_players (
  id SERIAL PRIMARY KEY,
  mlb_id INT UNIQUE NOT NULL,         -- MLB Stats API player ID
  full_name VARCHAR(150) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  primary_position VARCHAR(10),        -- C, 1B, 2B, SS, 3B, OF, SP, RP
  positions JSONB DEFAULT '[]',        -- all eligible positions
  mlb_team VARCHAR(100),
  mlb_team_id INT,
  status VARCHAR(30) DEFAULT 'active', -- active, injured, minors, retired
  is_prospect BOOLEAN DEFAULT false,
  debut_date DATE,
  birth_date DATE,
  bats VARCHAR(5),
  throws VARCHAR(5),
  jersey_number VARCHAR(5),
  headshot_url VARCHAR(500),
  games_by_position JSONB DEFAULT '{}', -- {"C": 12, "1B": 3} - last 3 years
  milb_position VARCHAR(10),           -- position from MiLB (for rookies)
  rp_starts INT DEFAULT 0,             -- track RP->SP conversion (5 starts = mandatory SP)
  rp_converted_to_sp BOOLEAN DEFAULT FALSE,
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROSTER MANAGEMENT
-- ============================================================

-- Roster slots definition per team
-- 5 SP, 7 RP, 2 C, 1B, 2B, SS, 3B, 2 INF, 4 OF, UT, DH = 26 MLB slots
-- Plus prospect slots

CREATE TABLE roster_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  slot_type VARCHAR(20) NOT NULL,       -- SP, RP, C, 1B, 2B, SS, 3B, INF, OF, UT, DH, PROSPECT
  slot_number INT NOT NULL DEFAULT 1,   -- for multi-slot positions (SP1-SP5, RP1-RP7, etc.)
  player_id INT REFERENCES mlb_players(mlb_id),
  roster_level VARCHAR(10) DEFAULT 'MLB1' CHECK (roster_level IN ('MLB1', 'MLB2', 'PROSPECT')),
  is_active BOOLEAN DEFAULT true,
  acquired_date DATE,
  acquired_via VARCHAR(30),             -- draft, trade, waiver, free_agent
  season INT NOT NULL DEFAULT 2025,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, slot_type, slot_number, season)
);

-- ============================================================
-- SCORING ENGINE
-- ============================================================

-- Raw daily stats pulled from MLB API
CREATE TABLE player_game_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_mlb_id INT NOT NULL REFERENCES mlb_players(mlb_id),
  game_date DATE NOT NULL,
  game_pk INT NOT NULL,                 -- MLB game ID
  mlb_team_id INT,
  stat_type VARCHAR(10) NOT NULL CHECK (stat_type IN ('batting', 'pitching')),
  -- Batting stats
  at_bats INT DEFAULT 0,
  hits INT DEFAULT 0,
  singles INT DEFAULT 0,
  doubles INT DEFAULT 0,
  triples INT DEFAULT 0,
  home_runs INT DEFAULT 0,
  rbi INT DEFAULT 0,
  walks INT DEFAULT 0,
  strikeouts_batter INT DEFAULT 0,
  hbp INT DEFAULT 0,
  stolen_bases INT DEFAULT 0,
  caught_stealing INT DEFAULT 0,
  gidp INT DEFAULT 0,
  -- Pitching stats
  outs_recorded INT DEFAULT 0,
  hits_allowed INT DEFAULT 0,
  earned_runs INT DEFAULT 0,
  walks_allowed INT DEFAULT 0,
  strikeouts_pitcher INT DEFAULT 0,
  saves INT DEFAULT 0,
  innings_pitched DECIMAL(5,2) DEFAULT 0,
  games_started BOOLEAN DEFAULT false,
  -- Computed fantasy points
  fantasy_points DECIMAL(8,2) DEFAULT 0,
  raw_data JSONB,                       -- full API response for debugging
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_player_game_stats_unique ON player_game_stats(player_mlb_id, game_pk, stat_type);

-- Daily team scoring results
CREATE TABLE daily_team_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  score_date DATE NOT NULL,
  combined_date DATE,                   -- if <20 teams active, combined with next day
  fantasy_points DECIMAL(10,2) DEFAULT 0,
  rank_points DECIMAL(8,2) DEFAULT 0,   -- rank-based points awarded
  rank INT,                             -- 1st, 2nd, etc. among 6 teams that day
  games_counted INT DEFAULT 0,
  is_combined_day BOOLEAN DEFAULT false,
  lineup_snapshot JSONB,                -- snapshot of lineup used for this day
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, score_date)
);

-- Season standings / cumulative
CREATE TABLE season_standings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  season INT NOT NULL DEFAULT 2025,
  total_rank_points DECIMAL(10,2) DEFAULT 0,
  total_fantasy_points DECIMAL(10,2) DEFAULT 0,
  total_saves INT DEFAULT 0,            -- tiebreaker #1
  total_home_runs INT DEFAULT 0,        -- tiebreaker #2
  total_sp_points DECIMAL(10,2) DEFAULT 0, -- tiebreaker #3
  current_rank INT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, season)
);

-- ============================================================
-- LINEUP ENGINE
-- ============================================================

-- Daily lineup selections (auto-generated + manual overrides)
CREATE TABLE daily_lineups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  lineup_date DATE NOT NULL,
  slot_type VARCHAR(20) NOT NULL,
  slot_number INT NOT NULL DEFAULT 1,    -- differentiates C1/C2, OF1-OF4, INF1/INF2, etc.
  player_mlb_id INT REFERENCES mlb_players(mlb_id),
  is_auto_selected BOOLEAN DEFAULT true,
  is_mlb2_replacement BOOLEAN DEFAULT false,
  is_free_agent_fill BOOLEAN DEFAULT false,
  sp_game_pk INT,                        -- which game the SP is assigned to
  locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, lineup_date, slot_type, slot_number)
);

-- SP game assignments (1 SP per game per team)
CREATE TABLE sp_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  player_mlb_id INT NOT NULL REFERENCES mlb_players(mlb_id),
  game_date DATE NOT NULL,
  game_pk INT NOT NULL,
  assignment_type VARCHAR(20) DEFAULT 'rostered' CHECK (assignment_type IN ('rostered', 'prospect_spot', 'rp_as_sp')),
  is_mini_draft BOOLEAN DEFAULT false,
  locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, game_date, game_pk)
);

-- ============================================================
-- TRADES
-- ============================================================

CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposing_team_id UUID NOT NULL REFERENCES teams(id),
  receiving_team_id UUID NOT NULL REFERENCES teams(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'voided', 'commissioner_review')),
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  commissioner_approved BOOLEAN,
  notes TEXT,
  season INT NOT NULL DEFAULT 2025
);

CREATE TABLE trade_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id UUID NOT NULL REFERENCES trades(id),
  from_team_id UUID NOT NULL REFERENCES teams(id),
  to_team_id UUID NOT NULL REFERENCES teams(id),
  player_mlb_id INT REFERENCES mlb_players(mlb_id),
  asset_type VARCHAR(20) DEFAULT 'player' CHECK (asset_type IN ('player', 'prospect', 'draft_pick'))
);

-- ============================================================
-- FREE AGENTS & WAIVERS
-- ============================================================

CREATE TABLE free_agent_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  player_mlb_id INT NOT NULL REFERENCES mlb_players(mlb_id),
  claim_type VARCHAR(20) DEFAULT 'add' CHECK (claim_type IN ('add', 'waiver')),
  drop_player_mlb_id INT REFERENCES mlb_players(mlb_id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  priority_order INT,                   -- worst record goes first
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  season INT NOT NULL DEFAULT 2025
);

-- ============================================================
-- PROSPECT SYSTEM
-- ============================================================

CREATE TABLE prospect_rights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  player_mlb_id INT NOT NULL REFERENCES mlb_players(mlb_id),
  acquired_date DATE NOT NULL,
  acquired_via VARCHAR(30),
  status VARCHAR(20) DEFAULT 'prospect' CHECK (status IN ('prospect', 'called_up', 'released', 'became_fa')),
  veteran_notification_date DATE,       -- when team was notified of veteran status
  decision_deadline DATE,               -- deadline to activate or release
  activated_date DATE,
  season INT NOT NULL DEFAULT 2025,
  UNIQUE(player_mlb_id, season)
);

-- ============================================================
-- DRAFT
-- ============================================================

CREATE TABLE draft_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season INT NOT NULL DEFAULT 2025,
  draft_type VARCHAR(20) DEFAULT 'standard' CHECK (draft_type IN ('standard', 'mini', 'prospect')),
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'paused', 'completed')),
  draft_order JSONB,                    -- [team_id, team_id, ...]
  current_pick INT DEFAULT 1,
  total_picks INT,
  time_per_pick INT DEFAULT 120,        -- seconds
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE draft_picks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID NOT NULL REFERENCES draft_sessions(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  round INT NOT NULL,
  pick_number INT NOT NULL,
  player_mlb_id INT REFERENCES mlb_players(mlb_id),
  slot_type VARCHAR(20),
  picked_at TIMESTAMPTZ,
  is_auto_pick BOOLEAN DEFAULT false,
  UNIQUE(draft_id, pick_number)
);

-- ============================================================
-- LEAGUE SETTINGS
-- ============================================================

CREATE TABLE league_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season INT NOT NULL DEFAULT 2025,
  trade_deadline DATE DEFAULT '2025-08-15',
  roster_lock_date DATE DEFAULT '2025-09-15',
  min_teams_for_scoring INT DEFAULT 20,  -- MLB teams; if fewer in action, combine days
  season_start DATE,
  season_end DATE,
  scoring_rules JSONB DEFAULT '{
    "batting": {
      "single": 1,
      "double": 2,
      "triple": 3,
      "home_run": 4,
      "walk": 1,
      "hbp": 1,
      "gidp": -1,
      "rbi": 1,
      "stolen_base": 1,
      "caught_stealing": -1
    },
    "pitching": {
      "out_recorded": 1,
      "hit_allowed": -1,
      "earned_run": -2,
      "walk_allowed": -1,
      "strikeout": 1,
      "save": 2
    }
  }',
  roster_config JSONB DEFAULT '{
    "SP": 5, "RP": 7, "C": 2, "1B": 1, "2B": 1,
    "SS": 1, "3B": 1, "INF": 2, "OF": 4, "UT": 1, "DH": 1
  }',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season)
);

-- ============================================================
-- ACTIVITY LOG / AUDIT
-- ============================================================

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id),
  action_type VARCHAR(50) NOT NULL,     -- trade_proposed, player_added, lineup_set, etc.
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_roster_slots_team ON roster_slots(team_id, season);
CREATE INDEX idx_roster_slots_player ON roster_slots(player_id);
CREATE INDEX idx_player_game_stats_date ON player_game_stats(game_date);
CREATE INDEX idx_player_game_stats_player ON player_game_stats(player_mlb_id);
CREATE INDEX idx_daily_team_scores_date ON daily_team_scores(score_date);
CREATE INDEX idx_daily_team_scores_team ON daily_team_scores(team_id);
CREATE INDEX idx_trades_teams ON trades(proposing_team_id, receiving_team_id);
CREATE INDEX idx_mlb_players_name ON mlb_players(last_name, first_name);
CREATE INDEX idx_mlb_players_position ON mlb_players(primary_position);
CREATE INDEX idx_prospect_rights_team ON prospect_rights(team_id, season);

-- ============================================================
-- SEED: League Settings
-- ============================================================

INSERT INTO league_settings (season, trade_deadline, roster_lock_date, season_start, season_end)
VALUES (2025, '2025-08-15', '2025-09-15', '2025-03-27', '2025-09-28');
