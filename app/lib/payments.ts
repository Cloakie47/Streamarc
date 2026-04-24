import { PAYMENT_CONFIG } from "./constants";

export interface PaymentSession {
  sessionId: string;
  viewerId: string;
  creatorId: string;
  videoId: string;
  secondsWatched: number;
  secondsPaid: number;
  totalCost: number;
  isActive: boolean;
}

export interface BatchResult {
  success: boolean;
  batchId?: string;
  amount?: number;
  error?: string;
}

// Fire a payment batch to our API (Circle Gateway x402 transfer)
export async function firePaymentBatch(
  sessionId: string,
  viewerId: string,
  creatorId: string,
  videoId: string,
  secondsCovered: number,
  payload?: unknown,
  requirements?: unknown,
): Promise<BatchResult> {
  try {
    const res = await fetch("/api/gateway/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        viewer_id: viewerId,
        creator_id: creatorId,
        video_id: videoId,
        seconds_covered: secondsCovered,
        payload,
        requirements,
      }),
    });

    const data = (await res.json()) as {
      error?: string;
      details?: unknown;
      batch_id?: string;
      amount?: number;
    };
    if (!res.ok) {
      const detailStr =
        data.details != null ? JSON.stringify(data.details) : "";
      const err = [data.error, detailStr].filter(Boolean).join(" ").trim();
      return { success: false, error: err || "Request failed" };
    }

    return {
      success: true,
      batchId: data.batch_id,
      amount: data.amount,
    };
  } catch {
    return { success: false, error: "Network error" };
  }
}

export async function settleWatchSession(
  sessionId: string,
  viewerId: string,
  creatorId: string,
  videoId: string,
  secondsWatched: number,
  options?: { keepalive?: boolean },
): Promise<{ success: boolean; amount?: number; error?: string }> {
  try {
    const res = await fetch("/api/gateway/settle-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: options?.keepalive,
      body: JSON.stringify({
        session_id: sessionId,
        viewer_id: viewerId,
        creator_id: creatorId,
        video_id: videoId,
        seconds_watched: secondsWatched,
      }),
    });
    const data = (await res.json()) as { error?: string; amount?: number };
    if (!res.ok) return { success: false, error: data.error };
    return { success: true, amount: data.amount };
  } catch {
    return { success: false, error: "Network error" };
  }
}

// Send beacon on tab close (fire and forget)
export function sendBeaconBatch(
  sessionId: string,
  viewerId: string,
  creatorId: string,
  videoId: string,
  secondsCovered: number,
  payload?: unknown,
  requirements?: unknown,
): void {
  if (secondsCovered <= 0) return;

  const beaconPayload = JSON.stringify({
    session_id: sessionId,
    viewer_id: viewerId,
    creator_id: creatorId,
    video_id: videoId,
    seconds_covered: secondsCovered,
    payload,
    requirements,
  });

  navigator.sendBeacon(
    "/api/gateway/transfer",
    new Blob([beaconPayload], { type: "application/json" }),
  );
}

// Create a watch session in the DB
export async function createWatchSession(
  viewerId: string,
  videoId: string,
): Promise<string | null> {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewer_id: viewerId, video_id: videoId }),
    });
    const data = (await res.json()) as { session_id?: string };
    return data.session_id || null;
  } catch {
    return null;
  }
}

// End a watch session
export async function endWatchSession(
  sessionId: string,
  secondsWatched: number,
): Promise<void> {
  try {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ended_at: new Date().toISOString(),
        seconds_watched: secondsWatched,
        completed: true,
      }),
    });
  } catch {
    // best effort
  }
}

export const { intervalSeconds, ratePerSecond, freePreviewSeconds } = PAYMENT_CONFIG;
