CREATE TABLE lifeinbox.owner_settings (
  owner_id uuid PRIMARY KEY REFERENCES lifeinbox.owners (id) ON DELETE CASCADE,
  external_ai_enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE lifeinbox.items (
  owner_id uuid NOT NULL REFERENCES lifeinbox.owners (id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('note', 'url', 'image', 'pdf', 'document')),
  title text NOT NULL CHECK (btrim(title) <> ''),
  note_text text,
  original_url text,
  source_revision integer NOT NULL DEFAULT 1 CHECK (source_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id),
  CHECK ((kind = 'note') = (note_text IS NOT NULL)),
  CHECK ((kind = 'url') = (original_url IS NOT NULL)),
  CHECK (note_text IS NULL OR btrim(note_text) <> ''),
  CHECK (original_url IS NULL OR btrim(original_url) <> '')
);

CREATE INDEX items_owner_created_idx ON lifeinbox.items (owner_id, created_at DESC, id DESC);

CREATE TABLE lifeinbox.tags (
  owner_id uuid NOT NULL REFERENCES lifeinbox.owners (id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name <> '' AND name = btrim(name)),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, name)
);

CREATE TABLE lifeinbox.item_tags (
  owner_id uuid NOT NULL,
  item_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  PRIMARY KEY (owner_id, item_id, tag_id),
  FOREIGN KEY (owner_id, item_id) REFERENCES lifeinbox.items (owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id, tag_id) REFERENCES lifeinbox.tags (owner_id, id) ON DELETE CASCADE
);

CREATE INDEX item_tags_owner_tag_idx ON lifeinbox.item_tags (owner_id, tag_id);
