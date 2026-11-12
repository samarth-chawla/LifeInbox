import { requireOwner } from "../../../../server/require-owner";
import { ServerConfigError } from "../../../../server/env";
import { getAccount } from "../../../../server/services/account";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const owner = await requireOwner(request.headers);
    if (owner.status !== 200) {
      return Response.json(
        { code: owner.status === 401 ? "UNAUTHENTICATED" : "ACCOUNT_UNAVAILABLE" },
        { status: owner.status, headers },
      );
    }

    const account = await getAccount(owner.ownerId);
    if (!account) return Response.json({ code: "ACCOUNT_UNAVAILABLE" }, { status: 403, headers });

    return Response.json(account, { headers });
  } catch (error) {
    console.error(error instanceof ServerConfigError ? error.message : "LifeInbox account lookup failed");
    return Response.json({ code: "ACCOUNT_LOOKUP_UNAVAILABLE" }, { status: 503, headers });
  }
}
