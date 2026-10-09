// ═══════════════════════════════════════════════════════════════
// POSTCLASH — CONFIG
// Only the anon key goes here. NEVER the service_role key.
// Leave the two strings empty to run in DEMO MODE.
// ═══════════════════════════════════════════════════════════════

window.POSTCLASH_CONFIG = {
  // Paste your Supabase Project URL and anon public key here
  SUPABASE_URL:      '',
  SUPABASE_ANON_KEY: '',

  // Solana
  SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
  TOKEN_MINT:     '',
  TOKEN_DECIMALS: 6,

  // Product
  ROUND_MINUTES: 60,
  ENDING_SOON_SECONDS: 300,
  XP: {
    VOTE: 5,
    PREDICT: 10,
    CORRECT_PREDICTION: 50,
    SUBMIT_POST: 25,
  },
};
