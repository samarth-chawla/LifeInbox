import "server-only";
import { getPool } from "./pool";

export async function findActiveOwnerId(authSubject: string) {
  const result = await getPool().query<{ ownerId: string }>(
    `SELECT owners.id AS "ownerId"
       FROM lifeinbox.owner_identities AS identities
       JOIN lifeinbox.owners AS owners ON owners.id = identities.owner_id
      WHERE identities.provider = $1 AND identities.subject = $2 AND owners.active`,
    ["better-auth", authSubject],
  );

  return result.rows[0]?.ownerId ?? null;
}

export async function readActiveOwner(ownerId: string) {
  const result = await getPool().query<{ ownerId: string; createdAt: Date }>(
    `SELECT id AS "ownerId", created_at AS "createdAt"
       FROM lifeinbox.owners
      WHERE id = $1 AND active`,
    [ownerId],
  );

  return result.rows[0] ?? null;
}
