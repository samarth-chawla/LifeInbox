CREATE TABLE lifeinbox.owner_trials (
  owner_id uuid PRIMARY KEY REFERENCES lifeinbox.owners (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  deadline timestamptz NOT NULL,
  allowance_bytes bigint NOT NULL CHECK (allowance_bytes BETWEEN 1 AND 9007199254740991),
  ended_at timestamptz,
  end_reason text,
  CHECK (deadline = started_at + duration_seconds * interval '1 second'),
  CHECK (
    (ended_at IS NULL AND end_reason IS NULL) OR
    (ended_at IS NOT NULL AND end_reason IS NOT NULL AND ended_at >= started_at AND
      ((end_reason = 'time' AND ended_at = deadline) OR (end_reason = 'storage' AND ended_at < deadline)))
  )
);

CREATE TABLE lifeinbox.storage_usage (
  owner_id uuid PRIMARY KEY REFERENCES lifeinbox.owner_trials (owner_id) ON DELETE CASCADE,
  confirmed_bytes bigint NOT NULL DEFAULT 0 CHECK (confirmed_bytes >= 0),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0)
);

CREATE FUNCTION lifeinbox.enforce_trial_usage() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  trial lifeinbox.owner_trials%ROWTYPE;
  checked_at timestamptz;
BEGIN
  -- Cleanup can reduce usage even after the trial ends.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.confirmed_bytes <= OLD.confirmed_bytes AND NEW.reserved_bytes <= OLD.reserved_bytes THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT * INTO STRICT trial FROM lifeinbox.owner_trials WHERE owner_id = NEW.owner_id FOR UPDATE;
  checked_at := greatest(clock_timestamp(), trial.started_at);
  IF trial.ended_at IS NOT NULL OR checked_at >= trial.deadline THEN
    RAISE EXCEPTION 'Trial has ended' USING ERRCODE = '23514', CONSTRAINT = 'storage_usage_trial_active';
  END IF;
  IF NEW.confirmed_bytes > trial.allowance_bytes OR NEW.reserved_bytes > trial.allowance_bytes - NEW.confirmed_bytes THEN
    RAISE EXCEPTION 'Trial storage allowance exceeded' USING ERRCODE = '23514', CONSTRAINT = 'storage_usage_trial_allowance';
  END IF;
  IF NEW.confirmed_bytes = trial.allowance_bytes THEN
    UPDATE lifeinbox.owner_trials SET ended_at = checked_at, end_reason = 'storage' WHERE owner_id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER storage_usage_enforce_trial
BEFORE INSERT OR UPDATE ON lifeinbox.storage_usage
FOR EACH ROW EXECUTE FUNCTION lifeinbox.enforce_trial_usage();
