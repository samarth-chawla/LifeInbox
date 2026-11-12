import "server-only";
import { getPool } from "../db/pool";
import { readAccountTrial } from "./trials";

export function getAccount(ownerId: string) {
  return readAccountTrial(getPool(), ownerId);
}
