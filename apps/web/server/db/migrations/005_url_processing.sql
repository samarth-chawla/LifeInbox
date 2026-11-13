ALTER TABLE lifeinbox.items ADD COLUMN extracted_title text,
                            ADD COLUMN extracted_description text,
                            ADD COLUMN extracted_text text;

CREATE TABLE lifeinbox.processing_jobs (
  owner_id uuid NOT NULL,
  item_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  kind text NOT NULL CHECK (kind = 'url_extract'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 3),
  manual_retries integer NOT NULL DEFAULT 0 CHECK (manual_retries BETWEEN 0 AND 2),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, item_id, kind, source_revision),
  FOREIGN KEY (owner_id, item_id) REFERENCES lifeinbox.items (owner_id, id) ON DELETE CASCADE,
  CHECK ((status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR (status <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL))
);

CREATE INDEX processing_jobs_ready_idx ON lifeinbox.processing_jobs (available_at, created_at)
  WHERE status = 'queued';
CREATE INDEX processing_jobs_lease_idx ON lifeinbox.processing_jobs (lease_expires_at)
  WHERE status = 'running';

INSERT INTO lifeinbox.processing_jobs (owner_id, item_id, kind, source_revision)
SELECT owner_id, id, 'url_extract', source_revision FROM lifeinbox.items WHERE kind = 'url';
