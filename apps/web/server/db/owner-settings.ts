import "server-only";
import type { DatabaseQuery } from "./transaction";

type OwnerSettings = { externalAiEnabled: boolean };

export async function readOwnerSettings(db: DatabaseQuery, ownerId: string): Promise<OwnerSettings> {
  const result = await db.query<OwnerSettings>(
    `SELECT external_ai_enabled AS "externalAiEnabled" FROM lifeinbox.owner_settings WHERE owner_id = $1`,
    [ownerId],
  );
  return result.rows[0] ?? { externalAiEnabled: false };
}

export async function setExternalAiEnabled(db: DatabaseQuery, ownerId: string, enabled: boolean) {
  const result = await db.query<OwnerSettings>(
    `INSERT INTO lifeinbox.owner_settings (owner_id, external_ai_enabled)
     VALUES ($1, $2)
     ON CONFLICT (owner_id) DO UPDATE SET external_ai_enabled = EXCLUDED.external_ai_enabled
     RETURNING external_ai_enabled AS "externalAiEnabled"`,
    [ownerId, enabled],
  );
  return result.rows[0];
}
