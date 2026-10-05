-- Teacher drafts stay until their owner explicitly deletes them.
ALTER TABLE drafts ADD COLUMN document_text TEXT;
ALTER TABLE drafts ADD COLUMN document_revision INTEGER NOT NULL DEFAULT 0;
-- Protect existing drafts while the previous Worker version is still running.
-- The new Worker ignores expiry and serializes retention as manual-only.
UPDATE drafts SET expires_at = 253402300799000;
