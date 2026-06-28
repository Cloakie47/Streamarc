// Shared clip configuration — pure constants, safe to import from both client
// components and server routes.

/**
 * Minimum source-video length (seconds) for AI clipping ("Generate Clips with
 * the AI Agent"). Shorter videos can still be clipped MANUALLY (no minimum).
 */
export const MIN_AI_CLIP_SECONDS = 120
