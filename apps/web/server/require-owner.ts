import "server-only";
import { getAuth } from "./auth";
import { findActiveOwnerId } from "./db/owners";

export async function requireOwner(headers: Headers) {
  const session = await getAuth().api.getSession({
    headers,
    query: { disableCookieCache: true },
  });

  if (!session?.user.emailVerified) return { status: 401 } as const;

  const ownerId = await findActiveOwnerId(session.user.id);
  if (!ownerId) return { status: 403 } as const;

  return { status: 200, ownerId } as const;
}
