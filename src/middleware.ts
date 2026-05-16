import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(req: NextRequest) {
  const session = getSessionCookie(req);
  // UX gate only: presence check, not the security boundary. Server actions re-validate via auth.api.getSession and scope by userId.
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/", "/import/:path*", "/plan/:path*"] };
