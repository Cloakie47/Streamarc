import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role?: string;
      gateway_balance?: number;
      wallet_address?: string | null;
      display_name?: string | null;
      avatar_url?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    gateway_balance?: number;
    wallet_address?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  }
}
