/**
 * Sets a valid NextAuth v5 JWT session cookie on the browser context so that
 * the middleware's auth check passes without a real Google OAuth flow.
 *
 * Requires NEXTAUTH_SECRET to be set in the environment (or falls back to the
 * development default "secret").
 */
import type { BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

export type TestUser = {
  email: string;
  name: string;
  role: "employee" | "admin";
};

export async function setAuthCookie(context: BrowserContext, user: TestUser): Promise<void> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "secret";
  const now = Math.floor(Date.now() / 1000);

  const token = await encode({
    token: {
      sub: "test-user-uuid",
      name: user.name,
      email: user.email,
      role: user.role,
      iat: now,
      exp: now + 86400,
      jti: "playwright-test-jti",
    },
    secret,
    salt: "authjs.session-token",
  });

  await context.addCookies([
    {
      name: "authjs.session-token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
