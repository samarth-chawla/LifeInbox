import "server-only";
import type { DatabaseQuery } from "./transaction";

type Tag = { id: string; name: string };

export async function getOrCreateTag(db: DatabaseQuery, ownerId: string, name: string) {
  const result = await db.query<Tag>(
    `INSERT INTO lifeinbox.tags (owner_id, name) VALUES ($1, $2)
     ON CONFLICT (owner_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [ownerId, name.trim()],
  );
  return result.rows[0];
}

export async function attachTag(db: DatabaseQuery, ownerId: string, itemId: string, tagId: string) {
  await db.query(
    `INSERT INTO lifeinbox.item_tags (owner_id, item_id, tag_id) VALUES ($1, $2, $3)
     ON CONFLICT (owner_id, item_id, tag_id) DO NOTHING`,
    [ownerId, itemId, tagId],
  );
}

export async function listItemTags(db: DatabaseQuery, ownerId: string, itemId: string) {
  const result = await db.query<Tag>(
    `SELECT tags.id, tags.name
     FROM lifeinbox.item_tags AS assignments
     JOIN lifeinbox.tags AS tags ON tags.owner_id = assignments.owner_id AND tags.id = assignments.tag_id
     WHERE assignments.owner_id = $1 AND assignments.item_id = $2
     ORDER BY tags.name, tags.id`,
    [ownerId, itemId],
  );
  return result.rows;
}
