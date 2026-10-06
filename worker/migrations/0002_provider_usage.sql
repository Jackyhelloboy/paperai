-- A Cloudflare-reported snapshot, not an app-owned quota counter.
CREATE TABLE IF NOT EXISTS provider_usage (
  provider TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
