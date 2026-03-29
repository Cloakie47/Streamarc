import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { supabaseAdmin } from "./supabase-server";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        role: { label: "Role", type: "text" },
        action: { label: "Action", type: "text" },
        wallet_address: { label: "Wallet", type: "text" },
        message: { label: "Message", type: "text" },
        signature: { label: "Signature", type: "text" },
        totp_code: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials) return null;

        const action = credentials.action as string | undefined;

        if (action === "email_signin") {
          if (!credentials.email || !credentials.password) return null;
          const email = (credentials.email as string).toLowerCase();
          const password = credentials.password as string;

          const { data: user } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("email", email)
            .maybeSingle();

          if (!user) throw new Error("Invalid email or password");
          if (!user.email_verified) throw new Error("Please verify your email first");
          if (!user.password_hash) throw new Error("Please sign in with Google");

          const bcryptMod = await import("bcryptjs");
          const valid = await bcryptMod.default.compare(password, user.password_hash);
          if (!valid) throw new Error("Invalid email or password");

          if (user.totp_enabled) {
            const totpCode = (credentials as { totp_code?: string }).totp_code;
            if (!totpCode) throw new Error("2FA_REQUIRED:" + user.id);
            if (!user.totp_secret) throw new Error("2FA not configured");

            const { verifySync } = await import("otplib");
            const { valid: totpValid } = verifySync({
              secret: user.totp_secret,
              token: String(totpCode).trim(),
            });
            if (!totpValid) throw new Error("Invalid 2FA code");
          }

          return {
            id: user.id,
            email: user.email,
            role: user.role,
            gateway_balance: user.gateway_balance,
            wallet_address: user.wallet_address,
            display_name: user.display_name,
          };
        }

        if (!credentials.email || !credentials.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const { data: signInData, error: signInError } =
          await supabaseAdmin.auth.signInWithPassword({ email, password });

        if (signInError || !signInData.user) {
          throw new Error("Invalid email or password");
        }

        const { data: profile } = await supabaseAdmin
          .from("users")
          .select("*")
          .eq("id", signInData.user.id)
          .single();

        if (!profile) throw new Error("Profile not found");

        return {
          id: profile.id,
          email: profile.email,
          role: profile.role,
          gateway_balance: profile.gateway_balance,
          wallet_address: profile.wallet_address,
          display_name: profile.display_name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && account?.provider === "google") {
        const { data: profile } = await supabaseAdmin
          .from("users")
          .select("*")
          .eq("email", user.email!)
          .maybeSingle();

        if (!profile) {
          const { data: authUser, error: createAuthError } =
            await supabaseAdmin.auth.admin.createUser({
              email: user.email!,
              email_confirm: true,
            });

          if (createAuthError || !authUser.user) {
            throw new Error(createAuthError?.message ?? "Could not create account");
          }

          const userId = authUser.user.id;
          const { createGatewayWallet } = await import("./circle-wallets");
          const wallet = await createGatewayWallet(userId);

          await supabaseAdmin.from("users").insert({
            id: userId,
            email: user.email!,
            role: "creator",
            gateway_balance: 0,
            wallet_address: wallet?.address ?? null,
            circle_wallet_id: wallet?.id ?? null,
            display_name: user.name || null,
          });

          token.id = userId;
          token.role = "creator";
          token.gateway_balance = 0;
          token.wallet_address = wallet?.address ?? null;
          token.display_name = user.name ?? null;
        } else {
          // Existing user — check if they need a Circle wallet created
          if (!profile.circle_wallet_id && !profile.wallet_address) {
            const { createGatewayWallet } = await import("./circle-wallets");
            const wallet = await createGatewayWallet(profile.id);
            if (wallet) {
              await supabaseAdmin
                .from("users")
                .update({
                  wallet_address: wallet.address,
                  circle_wallet_id: wallet.id,
                })
                .eq("id", profile.id);
              token.wallet_address = wallet.address;
            }
          } else {
            token.wallet_address = profile.wallet_address;
          }

          token.id = profile.id;
          token.role = profile.role;
          token.gateway_balance = profile.gateway_balance;
          token.display_name = profile.display_name ?? null;
        }
      } else if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.gateway_balance = (user as { gateway_balance?: number }).gateway_balance;
        token.wallet_address = (user as { wallet_address?: string | null }).wallet_address;
        token.display_name = (user as { display_name?: string | null }).display_name ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { gateway_balance?: number }).gateway_balance = token.gateway_balance as number;
        (session.user as { wallet_address?: string | null }).wallet_address = token.wallet_address as
          | string
          | null
          | undefined;
        (session.user as { display_name?: string | null }).display_name =
          (token.display_name as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
});
