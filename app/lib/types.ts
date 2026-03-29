export interface User {
  id: string;
  email?: string;
  wallet_address?: string;
  role: "viewer" | "creator" | "admin";
  display_name?: string;
  gateway_balance: number;
  total_spent: number;
  created_at: string;
}

export interface Video {
  id: string;
  creator_id: string;
  title: string;
  description?: string;
  cloudflare_uid?: string;
  thumbnail_url?: string;
  duration_secs: number;
  rate_per_sec: number;
  status: "pending" | "processing" | "live" | "removed";
  views: number;
  total_earned: number;
  created_at: string;
}

export interface WatchSession {
  id: string;
  viewer_id: string;
  video_id: string;
  started_at: string;
  ended_at?: string;
  seconds_watched: number;
  seconds_paid: number;
  total_cost: number;
  completed: boolean;
}

export interface PaymentBatch {
  id: string;
  session_id: string;
  viewer_id: string;
  creator_id: string;
  video_id: string;
  amount: number;
  seconds_covered: number;
  chain: string;
  tx_hash?: string;
  status: "pending" | "settled" | "failed";
  settled_at?: string;
  created_at: string;
}

export interface Earning {
  id: string;
  creator_id: string;
  video_id: string;
  batch_id: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  creator_id: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  wallet_address: string;
  status: "pending" | "processing" | "completed" | "failed";
  tx_hash?: string;
  requested_at: string;
  completed_at?: string;
}

export interface AdBanner {
  id: string;
  project_name: string;
  logo_initials: string;
  headline: string;
  description: string;
  destination_url: string;
  domain: string;
  arc_tag: string;
  active: boolean;
  starts_at: string;
  ends_at?: string;
}
