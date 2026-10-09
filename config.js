// ═══════════════════════════════════════════════════════════════
// POSTCLASH — PUBLIC FRONTEND CONFIG
// Only the anon/publishable key belongs here. NEVER the service role.
// ═══════════════════════════════════════════════════════════════

export const CONFIG = {
  // ── Supabase ──────────────────────────────────────────────
  // Leave blank to run in DEMO MODE (fully functional, clearly labelled).
  SUPABASE_URL:      '',   // e.g. 'https://abcdefgh.supabase.co'
  SUPABASE_ANON_KEY: '',   // e.g. 'eyJhbGciOi...'

  // ── Solana / Phantom ──────────────────────────────────────
  SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
  TOKEN_MINT:     '',      // PostClash SPL token mint address
  TOKEN_DECIMALS: 6,

  // ── X OAuth (redirect handled by edge function) ───────────
  X_OAUTH_START_URL: '',   // e.g. 'https://<ref>.supabase.co/functions/v1/x-oauth-start'

  // ── Product rules ─────────────────────────────────────────
  ROUND_MINUTES: 60,
  ENDING_SOON_SECONDS: 300,
  XP: {
    VOTE: 5,
    PREDICT: 10,
    CORRECT_PREDICTION: 50,
    SUBMIT_POST: 25,
    DAILY_STREAK: 15,
  },
};

export const IS_CONFIGURED = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
