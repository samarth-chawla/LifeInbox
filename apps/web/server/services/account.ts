import "server-only";
import { readActiveOwner } from "../db/owners";

export async function getAccount(ownerId: string) {
  const owner = await readActiveOwner(ownerId);
  return owner ? { ownerId: owner.ownerId, createdAt: owner.createdAt.toISOString() } : null;
}
