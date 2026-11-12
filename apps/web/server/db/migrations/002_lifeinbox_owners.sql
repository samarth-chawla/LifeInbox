CREATE SCHEMA IF NOT EXISTS lifeinbox;

CREATE TABLE lifeinbox.owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lifeinbox.owner_identities (
  provider text NOT NULL,
  subject text NOT NULL,
  owner_id uuid NOT NULL REFERENCES lifeinbox.owners (id),
  PRIMARY KEY (provider, subject)
);

CREATE INDEX owner_identities_owner_idx ON lifeinbox.owner_identities (owner_id);

-- The trigger shares the transaction that inserts the Better Auth user.
CREATE FUNCTION lifeinbox.provision_better_auth_owner() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  new_owner_id uuid;
BEGIN
  INSERT INTO lifeinbox.owners DEFAULT VALUES RETURNING id INTO new_owner_id;
  INSERT INTO lifeinbox.owner_identities (provider, subject, owner_id)
    VALUES ('better-auth', NEW.id, new_owner_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER lifeinbox_provision_owner
AFTER INSERT ON auth."user"
FOR EACH ROW EXECUTE FUNCTION lifeinbox.provision_better_auth_owner();
