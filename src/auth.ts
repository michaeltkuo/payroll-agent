import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { supabaseAdmin } from "@/lib/supabase";
import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "employee" | "admin";
    };
  }
}

const config: NextAuthConfig = {
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const role =
        user.email === process.env.ADMIN_EMAIL ? "admin" : "employee";

      // Upsert into our custom users table
      const { error } = await supabaseAdmin.from("users").upsert(
        {
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
          role,
        },
        { onConflict: "email" }
      );

      if (error) {
        console.error("Failed to upsert user:", error.message);
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        // Fetch role from our users table on initial sign-in
        const { data } = await supabaseAdmin
          .from("users")
          .select("role")
          .eq("email", user.email)
          .maybeSingle();

        token["role"] = (data?.role as "employee" | "admin") ?? "employee";
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub ?? "",
          role: (token["role"] as "employee" | "admin") ?? "employee",
        },
      };
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
