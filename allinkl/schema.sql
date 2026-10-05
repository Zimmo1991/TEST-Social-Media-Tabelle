CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','subadmin','customer')),
  password_hash TEXT NOT NULL, table_ids_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS single_active_owner ON users(role) WHERE role='owner' AND active=1;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, remember_me INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_attempts (
  scope TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_expiry ON auth_attempts(expires_at);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT,
  created_at TEXT NOT NULL, requested_ip TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user ON password_reset_tokens(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry ON password_reset_tokens(expires_at);
CREATE TABLE IF NOT EXISTS planner_state (
  id INTEGER PRIMARY KEY CHECK(id=1), state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS planner_media (
  id TEXT PRIMARY KEY, table_id TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL, byte_size INTEGER NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS planner_media_table ON planner_media(table_id,created_at DESC);
CREATE TABLE IF NOT EXISTS planner_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, table_id TEXT NOT NULL, table_name TEXT NOT NULL,
  user_id TEXT NOT NULL, user_name TEXT NOT NULL, description TEXT NOT NULL,
  byte_size INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS planner_history_created ON planner_history(created_at DESC);
CREATE TABLE IF NOT EXISTS user_invitations (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, email TEXT NOT NULL COLLATE NOCASE,
  table_ids_json TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_at TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_invitations_email ON user_invitations(email,created_at DESC);
CREATE INDEX IF NOT EXISTS user_invitations_expiry ON user_invitations(expires_at);
CREATE TABLE IF NOT EXISTS instagram_connections (
  table_id TEXT PRIMARY KEY, table_name TEXT NOT NULL, instagram_user_id TEXT NOT NULL,
  username TEXT, account_type TEXT, encrypted_access_token TEXT NOT NULL,
  token_expires_at TEXT, connected_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY, table_id TEXT NOT NULL, table_name TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY, table_id TEXT NOT NULL, table_name TEXT NOT NULL,
  calendar_year INTEGER NOT NULL DEFAULT 2026, week_number INTEGER NOT NULL, item_index INTEGER NOT NULL,
  content_type TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', media_json TEXT NOT NULL,
  scheduled_at TEXT, customer_approved INTEGER NOT NULL DEFAULT 0,
  main_admin_approved INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
  instagram_media_id TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT
);
CREATE INDEX IF NOT EXISTS publications_due ON publications(status,scheduled_at);
CREATE INDEX IF NOT EXISTS publications_table ON publications(table_id,created_at DESC);
CREATE TABLE IF NOT EXISTS publication_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, publication_id TEXT NOT NULL, event_type TEXT NOT NULL,
  message TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(publication_id) REFERENCES publications(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ai_customer_configs (
  table_id TEXT PRIMARY KEY, table_name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
  image_folder TEXT NOT NULL DEFAULT '', allowed_websites_json TEXT NOT NULL DEFAULT '[]',
  pdf_files_json TEXT NOT NULL DEFAULT '[]', tone TEXT NOT NULL DEFAULT '',
  forbidden_terms_json TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '',
  field_mapping_json TEXT NOT NULL DEFAULT '{"german":"text","italian":"textItalian"}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_drafts (
  id TEXT PRIMARY KEY, table_id TEXT NOT NULL, table_name TEXT NOT NULL,
  calendar_year INTEGER NOT NULL, week_number INTEGER NOT NULL, item_index INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type='post'), image_name TEXT NOT NULL,
  image_path TEXT NOT NULL, image_hash TEXT NOT NULL, image_mime_type TEXT NOT NULL,
  image_description TEXT NOT NULL DEFAULT '', german_text TEXT NOT NULL,
  italian_text TEXT NOT NULL, assignments_json TEXT NOT NULL,
  config_snapshot_json TEXT NOT NULL, sources_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
  created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_drafts_customer_image ON ai_drafts(table_id,image_hash);
CREATE INDEX IF NOT EXISTS ai_drafts_table ON ai_drafts(table_id,created_at DESC);
