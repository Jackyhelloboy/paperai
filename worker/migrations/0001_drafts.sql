-- PaperAI drafts: a growing document built one page at a time.
-- Text and page order live here. Page photos live in R2 (auto-deleted after 60 days).
-- Everything is scoped to an unguessable owner key; there is no login.

CREATE TABLE IF NOT EXISTS drafts (
  id           TEXT PRIMARY KEY,
  owner_key    TEXT NOT NULL,
  title        TEXT,
  status       TEXT NOT NULL DEFAULT 'building',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS drafts_owner_updated ON drafts(owner_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS drafts_expires ON drafts(expires_at);

CREATE TABLE IF NOT EXISTS draft_pages (
  id           TEXT PRIMARY KEY,
  draft_id     TEXT NOT NULL,
  position     INTEGER NOT NULL,
  source_name  TEXT,
  image_key    TEXT,
  image_bytes  INTEGER,
  ocr_text     TEXT NOT NULL DEFAULT '',
  edited_text  TEXT,
  page_profile TEXT,
  reading      TEXT,
  state        TEXT NOT NULL DEFAULT 'ready',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS draft_pages_draft_position ON draft_pages(draft_id, position);
CREATE INDEX IF NOT EXISTS draft_pages_updated ON draft_pages(updated_at);