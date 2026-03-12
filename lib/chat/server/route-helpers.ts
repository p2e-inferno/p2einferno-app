import { NextRequest, NextResponse } from "next/server";
import { getPrivyUserFromNextRequest } from "@/lib/auth/privy";

export async function requireChatRouteUser(req: NextRequest) {
  const user = await getPrivyUserFromNextRequest(req);

  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    };
  }

  return {
    user,
    response: null,
  };
}

export async function parseChatRouteJson<T>(req: NextRequest) {
  try {
    return {
      body: (await req.json()) as T,
      response: null,
    };
  } catch {
    return {
      body: null,
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }
}

export function chatRouteBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
