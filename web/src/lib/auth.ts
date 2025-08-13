import type { NextAuthOptions, User } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";

const DEFAULT_USERNAME = process.env.LOCAL_USERNAME || "anoop@opsmx.io";
const PASSWORD_HASH = process.env.LOCAL_PASSWORD_HASH || ""; // bcrypt hash
const FALLBACK_PASSWORD = process.env.LOCAL_PASSWORD || ""; // optional fallback (dev only)

async function verifyPassword(plain: string): Promise<boolean> {
  if (PASSWORD_HASH) {
    try {
      return await bcrypt.compare(plain, PASSWORD_HASH);
    } catch {
      return false;
    }
  }
  if (FALLBACK_PASSWORD) return plain === FALLBACK_PASSWORD;
  return false;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    // Google OAuth (users can sign in with their Gmail)
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
    // Credentials fallback (demo login)
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username || "");
        const password = String(credentials?.password || "");
        if (username !== DEFAULT_USERNAME) return null;
        const ok = await verifyPassword(password);
        if (!ok) return null;
        const user: User = { id: username, name: username, email: username };
        return user;
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
};
