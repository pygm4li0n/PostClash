// ═══════════════════════════════════════════════════════════════
// POSTCLASH — APPLICATION
// ═══════════════════════════════════════════════════════════════
import { CONFIG, IS_CONFIGURED } from './config.js';

/* ───────────────────────── Utilities ───────────────────────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const short = a => a ? `${a.slice(0,4)}…${a.slice(-4)}` : '';
const fmt   = n => new Intl.NumberFormat('en', { notation: n > 9999 ? 'compact' : 'standard' }).format(n || 0);
const uid   = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
function countdown(ms) {
  if (ms <= 0) return '00:00:00';
  const t = Math.floor(ms / 1000);
  const h = String(Math.floor(t / 3600)).padStart(2, '0');
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/* ───────────────────────── State ───────────────────────── */
const State = {
  sb: null,
  demo: !IS_CONFIGURED,
  route: 'arena',
  wallet: null,          // { address, verified, tier }
  profile: null,
  xAccount: null,
  battles: [],
  votes: {},             // battleId -> entryId
  predictions: {},       // battleId -> entryId
  reactions: {},         // battleId -> { A:Set, B:Set }
  leaderboard: [],
  quests: [],
  achievements: [],
  admin: false,
  loading: true,
};

/* Local persistence for demo mode */
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('pc_' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pc_' + k, JSON.stringify(v)); } catch {} },
};

/* ───────────────────────── Toast ───────────────────────── */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 250); }, 3400);
}

/* ───────────────────────── Modal ───────────────────────── */
function modal({ title, body, actions = [], width }) {
  const root = $('#modal-root');
  root.hidden = false;
  root.innerHTML = `
    <div class="modal" style="${width ? `width:${width}` : ''}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">
        ${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-ghost'}" data-mact="${i}">${esc(a.label)}</button>`).join('')}
      </div>` : ''}
    </div>`;
  const close = () => { root.hidden = true; root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('[data-close]').onclick = close;
  root.onclick = e => { if (e.target === root) close(); };
  actions.forEach((a, i) => {
    const b = root.querySelector(`[data-mact="${i}"]`);
    if (b) b.onclick = () => { a.onClick?.(close); if (a.autoClose !== false) close(); };
  });
  return { close, root };
}
function confirmDialog(title, message, confirmLabel = 'Confirm') {
  return new Promise(res => {
    modal({
      title,
      body: `<p style="color:var(--muted);font-size:14px">${esc(message)}</p>`,
      actions: [
        { label: 'Cancel', cls: 'btn-ghost', onClick: () => res(false) },
        { label: confirmLabel, cls: 'btn-primary', onClick: () => res(true) },
      ],
    });
  });
}

/* ───────────────────────── Supabase init ───────────────────────── */
async function initSupabase() {
  if (!IS_CONFIGURED) {
    $('#boot-note').textContent = 'DEMO MODE — no Supabase configured';
    return null;
  }
  try {
    $('#boot-note').textContent = 'Connecting to Supabase…';
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 8 } },
    });
    return sb;
  } catch (e) {
    console.error('[PostClash] Supabase init failed', e);
    toast('Supabase connection failed — falling back to demo mode', 'err');
    return null;
  }
}

/* ───────────────────────── Demo data ───────────────────────── */
const DEMO_POSTS = [
  { author:'Solana Labs', handle:'@solanalabs', av:'S', text:'Solana processes 65,000 TPS at fractions of a cent. The chain that keeps shipping while others plan.', url:'https://x.com/solanalabs/status/1000000000000000001', likes:12400, reposts:2100 },
  { author:'Anatoly K.',  handle:'@aeyakovenko', av:'A', text:'The only metric that matters long-term is whether developers keep choosing to build. Everything else follows.', url:'https://x.com/aeyakovenko/status/1000000000000000002', likes:9800, reposts:1750 },
  { author:'Mert',       handle:'@mert', av:'M', text:'Retail does not care about your architecture diagram. They care that it works when they click the button.', url:'https://x.com/mert/status/1000000000000000003', likes:15200, reposts:3400 },
  { author:'Raj',        handle:'@rajgokal', av:'R', text:'Every cycle the same argument: is it too early? The answer is always the same — build anyway.', url:'https://x.com/rajgokal/status/1000000000000000004', likes:7300, reposts:1200 },
  { author:'Toly',       handle:'@toly', av:'T', text:'Latency is a product feature. Users feel 400ms. They do not feel your consensus mechanism.', url:'https://x.com/toly/status/1000000000000000005', likes:11100, reposts:2600 },
  { author:'Superteam',  handle:'@superteam', av:'S', text:'The best builders in this ecosystem are the ones who shipped something ugly in week one and iterated forever.', url:'https://x.com/superteam/status/1000000000000000006', likes:6400, reposts:980 },
  { author:'SolanaFloor',handle:'@SolanaFloor', av:'S', text:'On-chain data does not lie. Volume tells you where the attention actually is, not where people say it is.', url:'https://x.com/SolanaFloor/status/1000000000000000007', likes:8900, reposts:1400 },
  { author:'Jupiter',    handle:'@JupiterExchange', av:'J', text:'Routing is invisible when it works and catastrophic when it does not. That asymmetry is the whole game.', url:'https://x.com/JupiterExchange/status/1000000000000000008', likes:13500, reposts:2900 },
  { author:'Phantom',    handle:'@phantom', av:'P', text:'A wallet is not a login screen. It is the user\'s identity, assets and reputation in one keypair.', url:'https://x.com/phantom/status/1000000000000000009', likes:10600, reposts:2000 },
  { author:'Helius',     handle:'@heliuslabs', av:'H', text:'RPC is infrastructure until it breaks. Then it is the only thing anyone talks about for a week.', url:'https://x.com/heliuslabs/status/10000000000000000010', likes:5200, reposts:870 },
];

function makeDemoBattles() {
  const now = Date.now();
  const spec = [
    { off: -25*60*1000, dur: 60, votesA: 842, votesB: 617, status: 'live' },
    { off: -48*60*1000, dur: 60, votesA: 1290, votesB: 1310, status: 'live' },
    { off: -52*60*1000, dur: 60, votesA: 2104, votesB: 986, status: 'live' },
    { off: -55*60*1000, dur: 60, votesA: 431, votesB: 402, status: 'live' },
    { off: -95*60*1000, dur: 60, votesA: 3320, votesB: 2180, status: 'finished' },
    { off: -140*60*1000, dur: 60, votesA: 780, votesB: 1180, status: 'finished' },
  ];
  return spec.map((s, i) => {
    const a = DEMO_POSTS[(i * 2) % DEMO_POSTS.length];
    const b = DEMO_POSTS[(i * 2 + 1) % DEMO_POSTS.length];
    const start = now + s.off;
    const end = start + s.dur * 60 * 1000;
    const finished = s.status === 'finished' || end < now;
    return {
      id: `demo-${i + 1}`,
      status: finished ? 'finalized' : 'live',
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      votes_a: s.votesA,
      votes_b: s.votesB,
      winner: finished ? (s.votesA >= s.votesB ? 'a' : 'b') : null,
      entry_a: { id:`ea${i}`, post: a },
      entry_b: { id:`eb${i}`, post: b },
    };
  });
}

function makeDemoLeaderboard() {
  const names = ['noscope','0xVortex','SolSniper','gm_ser','PhantomKid','liquidityghost','degen_mike','moonboi',
                 'TolyFan42','ape_engineer','chadwick','sol_maxi','quiet_builder','nightowl','green_candle'];
  return names.map((n, i) => ({
    rank: i + 1,
    handle: n,
    xp: 24000 - i * 1370 + Math.floor(Math.random() * 300),
    wins: 84 - i * 4,
    streak: Math.max(0, 12 - i),
  }));
}

function makeDemoQuests() {
  return [
    { id:'q1', ico:'🗳️', title:'Cast 5 votes',            desc:'Vote in any live battles',              prog:3, goal:5, xp:50,  done:false },
    { id:'q2', ico:'🔮', title:'Make 3 predictions',       desc:'Predict a winner before the round ends', prog:3, goal:3, xp:75,  done:true  },
    { id:'q3', ico:'📮', title:'Submit a post',            desc:'Submit any public X post URL',           prog:0, goal:1, xp:25,  done:false },
    { id:'q4', ico:'🔥', title:'Log in 3 days in a row',   desc:'Keep the streak alive',                  prog:2, goal:3, xp:60,  done:false },
    { id:'q5', ico:'🎯', title:'Predict 3 winners correctly', desc:'Accuracy matters',                   prog:1, goal:3, xp:150, done:false },
  ];
}

function makeDemoAchievements() {
  return [
    { ico:'🥇', title:'First Blood',   desc:'Cast your first vote',    on:true  },
    { ico:'🔮', title:'Oracle',        desc:'10 correct predictions',  on:true  },
    { ico:'⚡', title:'Speed Demon',   desc:'Vote within 60s of live', on:true  },
    { ico:'💎', title:'Diamond Hands', desc:'Hold token for 30 days',  on:false },
    { ico:'🏆', title:'Top 10',        desc:'Reach top 10 global',     on:false },
    { ico:'🔥', title:'Unstoppable',   desc:'30 day streak',           on:false },
    { ico:'🎪', title:'Clash Master',  desc:'Win 100 predictions',     on:false },
    { ico:'🌐', title:'Founder',       desc:'Join in season 1',        on:true  },
  ];
}

function makeDemoTiers() {
  return [
    { name:'Unranked', req:0,       mult:1.0,  color:'#5A635A' },
    { name:'Bronze',   req:1000,    mult:1.1,  color:'#C08050' },
    { name:'Silver',   req:10000,   mult:1.25, color:'#B8C4C0' },
    { name:'Gold',     req:50000,   mult:1.5,  color:'#FFB020' },
    { name:'Diamond',  req:250000,  mult:2.0,  color:'#39FF14' },
  ];
}

/* ───────────────────────── Data layer ───────────────────────── */
const Data = {
  async loadBattles() {
    if (State.demo) { State.battles = makeDemoBattles(); return State.battles; }
    const { data, error } = await State.sb
      .from('battles')
      .select(`id, status, starts_at, ends_at, winner,
               entry_a:battle_entries!battle_entries_battle_id_fkey(id, side, post:posts(*)),
               entry_b:battle_entries!battle_entries_battle_id_fkey(id, side, post:posts(*))`)
      .in('status', ['scheduled','live','finalized'])
      .order('ends_at', { ascending: true })
      .limit(40);
    if (error) { toast('Could not load battles: ' + error.message, 'err'); return []; }

    const ids = (data || []).map(b => b.id);
    let counts = {};
    if (ids.length) {
      const { data: v } = await State.sb.from('votes').select('battle_id,entry_id').in('battle_id', ids);
      (v || []).forEach(r => {
        counts[r.battle_id] ??= {};
        counts[r.battle_id][r.entry_id] = (counts[r.battle_id][r.entry_id] || 0) + 1;
      });
    }
    State.battles = (data || []).map(b => {
      const ea = (b.entry_a || []).find(e => e.side === 'a') || (b.entry_a || [])[0];
      const eb = (b.entry_b || []).find(e => e.side === 'b') || (b.entry_b || [])[0];
      const c = counts[b.id] || {};
      return {
        id: b.id, status: b.status, starts_at: b.starts_at, ends_at: b.ends_at, winner: b.winner,
        entry_a: { id: ea?.id, post: ea?.post },
        entry_b: { id: eb?.id, post: eb?.post },
        votes_a: c[ea?.id] || 0,
        votes_b: c[eb?.id] || 0,
      };
    });
    return State.battles;
  },

  async loadLeaderboard() {
    if (State.demo) { State.leaderboard = makeDemoLeaderboard(); return State.leaderboard; }
    const { data, error } = await State.sb
      .from('profiles')
      .select('handle, xp, wins, streak, avatar_url')
      .order('xp', { ascending: false })
      .limit(50);
    if (error) { toast('Leaderboard unavailable: ' + error.message, 'err'); return []; }
    State.leaderboard = (data || []).map((r, i) => ({ rank: i + 1, ...r }));
    return State.leaderboard;
  },

  async loadQuests() {
    if (State.demo) { State.quests = makeDemoQuests(); return State.quests; }
    const { data, error } = await State.sb.from('quests').select('*').eq('active', true);
    if (error) return [];
    const { data: prog } = await State.sb.from('quest_progress').select('*');
    State.quests = (data || []).map(q => {
      const p = (prog || []).find(x => x.quest_id === q.id) || { progress: 0, completed: false };
      return { ...q, prog: p.progress, goal: q.goal, done: p.completed };
    });
    return State.quests;
  },

  async loadAchievements() {
    if (State.demo) { State.achievements = makeDemoAchievements(); return State.achievements; }
    const { data } = await State.sb.from('achievements').select('*');
    const { data: mine } = await State.sb.from('user_achievements').select('achievement_id');
    const owned = new Set((mine || []).map(m => m.achievement_id));
    State.achievements = (data || []).map(a => ({ ...a, on: owned.has(a.id) }));
    return State.achievements;
  },

  async loadTiers() {
    if (State.demo) return makeDemoTiers();
    const { data } = await State.sb.from('token_tiers').select('*').order('min_amount');
    return (data || []).map(t => ({
      name: t.name, req: t.min_amount, mult: t.xp_multiplier, color: t.color || '#39FF14',
    }));
  },

  async castVote(battleId, entryId) {
    if (State.demo) {
      const key = 'votes';
      const all = LS.get(key, {});
      if (all[battleId]) throw new Error('You already voted in this battle.');
      all[battleId] = entryId;
      LS.set(key, all);
      State.votes = all;
      const b = State.battles.find(x => x.id === battleId);
      if (b) { if (b.entry_a.id === entryId) b.votes_a++; else b.votes_b++; }
      return true;
    }
    const { error } = await State.sb.from('votes').insert({
      battle_id: battleId, entry_id: entryId, user_id: State.profile.id,
    });
    if (error) throw error;
    State.votes[battleId] = entryId;
    return true;
  },

  async predict(battleId, entryId) {
    if (State.demo) {
      const all = LS.get('preds', {});
      if (all[battleId]) throw new Error('Prediction already locked for this battle.');
      all[battleId] = entryId;
      LS.set('preds', all);
      State.predictions = all;
      return true;
    }
    const { error } = await State.sb.from('predictions').insert({
      battle_id: battleId, entry_id: entryId, user_id: State.profile.id,
    });
    if (error) throw error;
    State.predictions[battleId] = entryId;
    return true;
  },

  async react(battleId, side, emoji) {
    if (State.demo) {
      const k = `react_${battleId}_${side}`;
      const set = new Set(LS.get(k, []));
      set.has(emoji) ? set.delete(emoji) : set.add(emoji);
      LS.set(k, [...set]);
      return [...set];
    }
    const { error } = await State.sb.from('reactions').upsert({
      battle_id: battleId, side, emoji, user_id: State.profile.id,
    }, { onConflict: 'battle_id,side,emoji,user_id' });
    if (error) throw error;
    return [emoji];
  },

  subscribeRealtime() {
    if (State.demo || !State.sb) return;
    State.sb.channel('pc-votes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, payload => {
        const { battle_id, entry_id } = payload.new;
        const b = State.battles.find(x => x.id === battle_id);
        if (!b) return;
        if (b.entry_a?.id === entry_id) b.votes_a++;
        else if (b.entry_b?.id === entry_id) b.votes_b++;
        if (State.route === 'arena') patchBattleCard(b);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'battles' }, payload => {
        const b = State.battles.find(x => x.id === payload.new.id);
        if (b) { Object.assign(b, { status: payload.new.status, winner: payload.new.winner }); patchBattleCard(b); }
      })
      .subscribe();
  },
};

/* ───────────────────────── Wallet ───────────────────────── */
const Wallet = {
  provider() {
    return window.phantom?.solana?.isPhantom ? window.phantom.solana
         : window.solana?.isPhantom ? window.solana
         : null;
  },

  available() { return !!this.provider(); },

  async connect() {
    const p = this.provider();
    if (!p) {
      modal({
        title: 'Phantom not detected',
        body: `<p style="color:var(--muted);font-size:14px;margin-bottom:12px">
          Install the Phantom browser extension to connect your Solana wallet.</p>
          <a class="btn btn-primary" href="https://phantom.app/" target="_blank" rel="noopener">Get Phantom</a>`,
        actions: [],
      });
      return;
    }
    try {
      const res = await p.connect();
      const address = res.publicKey.toString();
      State.wallet = { address, verified: false, tier: 'Unranked', balance: 0 };
      LS.set('wallet', address);
      renderTopbar();

      if (State.demo) {
        toast('Wallet connected (demo — signature not verified)', 'warn');
        State.wallet.verified = true;
        State.wallet.tier = 'Silver';
        State.wallet.balance = 12500;
        renderTopbar();
        return;
      }
      await this.verify(address, p);
    } catch (e) {
      if (e?.code === 4001) toast('Connection rejected', 'warn');
      else toast('Wallet error: ' + (e?.message || 'unknown'), 'err');
    }
  },

  async verify(address, provider) {
    try {
      // 1. Get nonce from edge function
      const r1 = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/wallet-nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (!r1.ok) throw new Error('nonce request failed');
      const { nonce, message } = await r1.json();

      // 2. Sign
      const encoded = new TextEncoder().encode(message);
      const { signature } = await provider.signMessage(encoded, 'utf8');
      const sigB64 = btoa(String.fromCharCode(...signature));

      // 3. Verify server-side
      const r2 = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/wallet-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, nonce, signature: sigB64 }),
      });
      if (!r2.ok) throw new Error('verification failed');
      const v = await r2.json();

      State.wallet.verified = true;
      State.wallet.balance  = v.balance || 0;
      State.wallet.tier     = v.tier || 'Unranked';
      renderTopbar();
      toast(`Verified · ${v.tier} tier`, '');
      await refreshProfile();
    } catch (e) {
      State.wallet.verified = false;
      toast('Signature verification failed — wallet is read-only', 'err');
      renderTopbar();
    }
  },

  disconnect() {
    try { this.provider()?.disconnect?.(); } catch {}
    State.wallet = null;
    LS.set('wallet', null);
    renderTopbar();
    toast('Wallet disconnected');
  },

  async autoReconnect() {
    const saved = LS.get('wallet', null);
    const p = this.provider();
    if (!saved || !p) return;
    try {
      const res = await p.connect({ onlyIfTrusted: true });
      const address = res.publicKey.toString();
      if (address === saved) {
        State.wallet = { address, verified: false, tier: 'Unranked', balance: 0 };
        renderTopbar();
        if (!State.demo) await this.verify(address, p);
      }
    } catch { /* silent */ }
  },
};

/* ───────────────────────── Router ───────────────────────── */
const ROUTES = {
  arena:       { title: 'Arena',       render: viewArena },
  discover:    { title: 'Discover',    render: viewDiscover },
  predictions: { title: 'Predictions', render: viewPredictions },
  leaderboard: { title: 'Leaderboard', render: viewLeaderboard },
  quests:      { title: 'Quests',      render: viewQuests },
  profile:     { title: 'Profile',     render: viewProfile },
  settings:    { title: 'Settings',    render: viewSettings },
  admin:       { title: 'Admin',       render: viewAdmin },
  battle:      { title: 'Battle',      render: viewBattleDetail },
};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'arena';
  const [route, param] = h.split('/');
  return { route: ROUTES[route] ? route : 'arena', param };
}

async function navigate() {
  const { route, param } = parseHash();
  State.route = route;
  State.param = param;

  $$('.nav-item, .mobile-nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.nav === route));

  $('#view-title').textContent = ROUTES[route].title;
  $('#view').innerHTML = `<div class="skeleton" style="height:120px;margin-bottom:16px"></div>
                          <div class="skeleton" style="height:280px"></div>`;

  try {
    await ROUTES[route].render(param);
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="empty"><div class="e-ico">⚠</div>
      <h3>Something went wrong</h3><p>${esc(e.message || 'Unknown error')}</p>
      <button class="btn btn-outline" onclick="location.reload()">Reload</button></div>`;
  }
  $('#view').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ───────────────────────── Shared partials ───────────────────────── */
function demoRibbon() {
  if (!State.demo) return '';
  return `<div class="demo-ribbon">
    <span>◈</span><b>DEMO MODE</b> — all data on this screen is sample data.
    <a href="#/settings">Connect Supabase →</a>
  </div>`;
}

function battleStatus(b) {
  const now = Date.now();
  const end = new Date(b.ends_at).getTime();
  const start = new Date(b.starts_at).getTime();
  if (b.status === 'finalized') return { cls: 'finished', label: 'FINISHED' };
  if (b.status === 'cancelled') return { cls: 'finished', label: 'CANCELLED' };
  if (now < start) return { cls: 'scheduled', label: 'SCHEDULED' };
  const left = end - now;
  if (left <= CONFIG.ENDING_SOON_SECONDS * 1000) return { cls: 'ending', label: 'ENDING SOON' };
  return { cls: 'live', label: 'LIVE' };
}

function battleCard(b) {
  const st = battleStatus(b);
  const total = (b.votes_a + b.votes_b) || 1;
  const pctA = Math.round((b.votes_a / total) * 100);
  const pctB = 100 - pctA;
  const myVote = State.votes[b.id] || LS.get('votes', {})[b.id];
  const myPred = State.predictions[b.id] || LS.get('preds', {})[b.id];
  const finished = b.status === 'finalized';
  const canVote = !finished && !myVote && st.cls !== 'scheduled';

  const side = (s, e, cls) => {
    const post = e?.post || {};
    const isWinner = finished && b.winner === s;
    return `<div class="side ${isWinner ? 'winner' : ''}" data-side="${s}">
      <div class="side-author">
        <div class="side-av">${post.avatar_url
          ? `<img src="${esc(post.avatar_url)}" alt="">`
          : esc((post.author || '?')[0])}</div>
        <div>
          <div class="side-name">${esc(post.author || 'Unknown')}</div>
          <div class="side-handle">${esc(post.handle || '@unknown')}</div>
        </div>
      </div>
      <p class="side-text">${esc(post.text || 'No preview available.')}</p>
      <a class="side-link" href="${esc(post.url || '#')}" target="_blank" rel="noopener">View on X ↗</a>
      <div class="vote-stats">
        <span><b>${fmt(b['votes_' + s])}</b> votes</span>
        <span>${s === 'a' ? pctA : pctB}%</span>
      </div>
      <div class="side-actions">
        <button class="vote-btn ${cls} ${myVote === e?.id ? 'voted' : ''}"
                data-vote="${b.id}" data-entry="${e?.id}" data-side="${s}"
                ${!canVote ? 'disabled' : ''}>
          ${myVote === e?.id ? '✓ Voted' : finished ? 'Voting closed' : 'Vote'}
        </button>
      </div>
    </div>`;
  };

  return `<article class="battle" data-battle="${b.id}">
    <div class="battle-head">
      <span class="status ${st.cls}">${st.label}</span>
      <span class="battle-timer" data-countdown="${b.ends_at}">
        <b>${countdown(new Date(b.ends_at) - Date.now())}</b>
      </span>
    </div>

    <div class="votebar" style="margin:0 18px 16px">
      <i class="vb-a" style="width:${pctA}%"></i>
      <i class="vb-b" style="width:${pctB}%"></i>
    </div>

    <div class="arena">
      ${side('a', b.entry_a, 'a')}
      <div class="arena-vs">VS</div>
      ${side('b', b.entry_b, 'b')}
    </div>

    <div class="react-row">
      ${['🔥','💎','🚀','🧠'].map(e =>
        `<button class="react" data-react="${b.id}" data-side="a" data-emoji="${e}">${e}</button>`).join('')}
      <button class="btn btn-ghost btn-sm" style="margin-left:auto"
              data-predict="${b.id}" data-finished="${finished}"
              ${finished || myPred ? 'disabled' : ''}>
        ${myPred ? '🔮 Locked' : '🔮 Predict'}
      </button>
      <button class="btn btn-ghost btn-sm" data-action="go" data-href="#/battle/${b.id}">Details</button>
    </div>

    <div class="battle-foot">
      <span class="mono">${b.id.slice(0, 12)}</span>
      <span>·</span>
      <span>${fmt(total)} total votes</span>
      ${finished && b.winner
        ? `<span class="badge accent" style="margin-left:auto">Winner: Side ${b.winner.toUpperCase()}</span>`
        : ''}
    </div>
  </article>`;
}

function patchBattleCard(b) {
  const el = $(`[data-battle="${b.id}"]`);
  if (!el) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = battleCard(b);
  el.replaceWith(fresh.firstElementChild);
}

/* ───────────────────────── Views ───────────────────────── */
async function viewArena() {
  if (!State.battles.length) await Data.loadBattles();
  const live = State.battles.filter(b => b.status === 'live');
  const done = State.battles.filter(b => b.status === 'finalized');

  $('#view').innerHTML = `
    ${demoRibbon()}
    <div class="view-head">
      <h1>Arena</h1>
      <p>Two posts enter. One wins. Vote in live rounds and watch the count update in real time.</p>
    </div>

    <div class="stats">
      <div class="stat"><b>${live.length}</b><span>Live battles</span></div>
      <div class="stat"><b>${fmt(live.reduce((s,b)=>s+b.votes_a+b.votes_b,0))}</b><span>Votes in play</span></div>
      <div class="stat"><b>${fmt(done.length)}</b><span>Settled</span></div>
      <div class="stat"><b>${fmt(State.profile?.xp || 0)}</b><span>Your XP</span></div>
    </div>

    ${live.length ? `
      <h2 style="font-size:16px;margin:26px 0 14px;letter-spacing:-.01em">Live now</h2>
      <div class="grid">${live.map(battleCard).join('')}</div>
    ` : `<div class="empty"><div class="e-ico">◈</div><h3>No live battles</h3>
          <p>Rounds start on a schedule. Check back shortly or submit a post to kick one off.</p>
          <a class="btn btn-primary" href="#/discover">Submit a post</a></div>`}

    ${done.length ? `
      <h2 style="font-size:16px;margin:34px 0 14px;letter-spacing:-.01em">Recently settled</h2>
      <div class="grid">${done.slice(0, 6).map(battleCard).join('')}</div>
    ` : ''}
  `;
}

async function viewBattleDetail(id) {
  if (!State.battles.length) await Data.loadBattles();
  const b = State.battles.find(x => x.id === id);
  if (!b) {
    $('#view').innerHTML = `<div class="empty"><div class="e-ico">◇</div>
      <h3>Battle not found</h3><p>This battle may have been removed.</p>
      <a class="btn btn-outline" href="#/arena">Back to Arena</a></div>`;
    return;
  }
  const st = battleStatus(b);
  const total = (b.votes_a + b.votes_b) || 1;
  const pctA = Math.round((b.votes_a / total) * 100);

  $('#view').innerHTML = `
    ${demoRibbon()}
    <div class="view-head">
      <h1>Battle detail</h1>
      <p class="mono" style="font-family:var(--fm);font-size:12px;color:var(--dim)">${esc(b.id)}</p>
    </div>
    <div class="stats">
      <div class="stat"><b>${st.label}</b><span>Status</span></div>
      <div class="stat"><b>${countdown(new Date(b.ends_at) - Date.now())}</b><span>Time left</span></div>
      <div class="stat"><b>${fmt(total)}</b><span>Total votes</span></div>
      <div class="stat"><b>${pctA}% / ${100-pctA}%</b><span>Split</span></div>
    </div>
    ${battleCard(b)}
    <div class="panel" style="margin-top:20px">
      <h3>Round rules</h3>
      <p style="color:var(--muted);font-size:13.5px">
        One vote per wallet per battle. Votes are enforced by a database unique constraint,
        not by the browser. Settlement is idempotent and runs server-side — the frontend
        clock is never trusted.
      </p>
    </div>
    <div style="margin-top:20px"><a class="btn btn-outline" href="#/arena">← Back to Arena</a></div>
  `;
}

async function viewDiscover() {
  const canSubmit = State.wallet?.verified && State.xAccount;
  $('#view').innerHTML = `
    ${demoRibbon()}
    <div class="view-head">
      <h1>Discover & submit</h1>
      <p>Paste a public X post URL to enter it into an upcoming round. Duplicate submissions are rejected.</p>
    </div>

    <div class="panel" style="margin-bottom:20px">
      <h3>Submit a post</h3>
      <div class="field">
        <label for="post-url">X post URL</label>
        <input class="input" id="post-url" type="url" placeholder="https://x.com/handle/status/1234567890" />
        <p class="hint" id="url-hint">Format: https://x.com/&lt;handle&gt;/status/&lt;id&gt;</p>
      </div>
      <button class="btn btn-primary" id="btn-submit-post" ${canSubmit ? '' : 'disabled'}>
        ${canSubmit ? 'Submit post' : 'Verify wallet & link X first'}
      </button>
      ${!canSubmit ? `<p class="hint">Wallet verified: <b>${State.wallet?.verified ? 'yes' : 'no'}</b> ·
        X linked: <b>${State.xAccount ? 'yes' : 'no'}</b></p>` : ''}
    </div>

    <div class="panel">
      <h3>Recently submitted</h3>
      <div id="discover-list">
        ${makeDemoPostsList()}
      </div>
    </div>
  `;

  const inp = $('#post-url');
  inp?.addEventListener('input', () => {
    const ok = /^https?:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/.test(inp.value.trim());
    inp.classList.toggle('err', inp.value.length > 0 && !ok);
    $('#url-hint').className = 'hint' + (inp.value.length > 0 && !ok ? ' err' : '');
    $('#url-hint').textContent = inp.value.length > 0 && !ok
      ? 'Not a valid X post URL'
      : 'Format: https://x.com/<handle>/status/<id>';
    $('#btn-submit-post').disabled = !ok || !canSubmit;
  });

  $('#btn-submit-post')?.addEventListener('click', () => submitPost(inp.value.trim()));
}

function makeDemoPostsList() {
  return DEMO_POSTS.slice(0, 5).map((p, i) => `
    <div class="row">
      <div class="row-rank">${i + 1}</div>
      <div class="row-main">
        <div class="row-name">${esc(p.author)} <span class="badge">${esc(p.handle)}</span></div>
        <div class="row-sub">${esc(p.text.slice(0, 70))}…</div>
      </div>
      <div class="row-val">${fmt(p.likes)} ♥</div>
    </div>`).join('');
}

async function submitPost(url) {
  if (State.demo) {
    toast('Demo mode — post accepted locally, not persisted', 'warn');
    return;
  }
  const { error } = await State.sb.from('posts').insert({
    url, user_id: State.profile.id, status: 'pending',
  });
  if (error) {
    if (error.code === '23505') toast('This post has already been submitted', 'warn');
    else toast('Submission failed: ' + error.message, 'err');
    return;
  }
  toast('Post submitted — awaiting round assignment');
  await grantXP(CONFIG.XP.SUBMIT_POST, 'post_submitted');
  $('#post-url').value = '';
  navigate();
}

async function viewPredictions() {
  if (!State.battles.length) await Data.loadBattles();
  const open = State.battles.filter(b => b.status === 'live');
  const preds = LS.get('preds', {});
  const mine = State.demo ? Object.entries(preds) : [];

  $('#view').innerHTML = `
    ${demoRibbon()}
    <div class="view-head">
      <h1>Predictions</h1>
      <p>Call the winner before the round ends. Correct calls earn XP. No wagers, ever.</p>
    </div>

    <div class="stats">
      <div class="stat"><b>${Object.keys(preds).length}</b><span>Your predictions</span></div>
      <div class="stat"><b>${State.demo ? 1 : 0}</b><span>Correct</span></div>
      <div class="stat"><b>${CONFIG.XP.PREDICT} XP</b><span>Per prediction</span></div>
      <div class="stat"><b>${CONFIG.XP.CORRECT_PREDICTION} XP</b><span>Correct bonus</span></div>
    </div>

    <h2 style="font-size:16px;margin:10px 0 14px">Open battles</h2>
    ${open.length ? open.map(b => {
      const locked = preds[b.id];
      return `<div class="row">
        <div class="row-rank">🔮</div>
        <div class="row-main">
          <div class="row-name">${esc(b.entry_a.post.handle)} vs ${esc(b.entry_b.post.handle)}</div>
          <div class="row-sub">Ends in ${countdown(new Date(b.ends_at) - Date.now())}</div>
        </div>
        ${locked
          ? `<span class="badge violet">Locked · ${esc((locked === b.entry_a.id ? b.entry_a.post.handle : b.entry_b.post.handle))}</span>`
          : `<button class="btn btn-violet btn-sm" data-predict="${b.id}">Predict</button>`}
      </div>`;
    }).join('') : `<div class="empty"><div class="e-ico">◎</div><h3>No open battles</h3>
      <p>Predictions open when a round goes live.</p></div>`}
  `;
}

async function viewLeaderboard() {
  await Data.loadLeaderboard();
  const tabs = ['Global', 'Season 1'];
  $('#view').innerHTML = `
    ${demoRibbon()}
    <div class="view-head">
      <h1>Leaderboard</h1>
      <p>Ranked by XP earned through votes, predictions and quests. Season resets keep it competitive.</p>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:18px">
      ${tabs.map((t, i) => `<button class="btn ${i === 0 ? 'btn-primary' : 'btn-outline'} btn-sm">${t}</button>`).join('')}
    </div>
    ${State.leaderboard.map((r, i) => `
      <div class="row">
        <div class="row-rank ${i < 3 ? 'top' : ''}">${i + 1}</div>
        <div class="row-main">
          <div class="row-name">${esc(r.handle || r.name || 'anon')}
            ${i === 0 ? '<span class="badge accent">LEADER</span>' : ''}</div>
          <div class="row-sub">${r.wins || 0} correct · ${r.streak || 0}d streak</div>
        </div>
        <div class="row-val">${fmt(r.xp)} XP</div>
      </div>`).join('')}
  `;
}

async function viewQuests() {
  await Data.loadQuests();
  await Data.loadAchievements();

  $('#view').innerHTML = `
    ${demoRibbon()}
    <div class="view-head">
      <h1>Quests & achievements</h1>
      <p>Daily objectives refresh every 24 hours. Streaks multiply your XP over time.</p>
    </div>

    <div class="stats">
      <div class="stat"><b>${State.quests.filter(q => q.done).length}/${State.quests.length}</b><span>Quests done</span></div>
      <div class="stat"><b>${State.achievements.filter(a => a.on).length}/${State.achievements.length}</b><span>Achievements</span></div>
      <div class="stat"><b>${State.demo ? 2 : 0}🔥</b><span>Day streak</span></div>
      <div class="stat"><b>${fmt(State.profile?.xp || 0)}</b><span>Total XP</span></div>
    </div>

    <h2 style="font-size:16px;margin:10px 0 14px">Daily quests</h2>
    ${State.quests.map(q => `
      <div class="quest ${q.done ? 'done' : ''}">
        <div class="quest-ico">${q.ico}</div>
        <div class="quest-main">
          <h4>${esc(q.title)} ${q.done ? '<span class="badge accent">DONE</span>' : ''}</h4>
          <p>${esc(q.desc)}</p>
          <div class="progress"><i style="width:${Math.min(100, (q.prog / q.goal) * 100)}%"></i></div>
        </div>
        <div class="quest-xp">+${q.xp} XP</div>
      </div>`).join('')}

    <h2 style="font-size:16px;margin:34px 0 14px">Achievements</h2>
    <div class="ach-grid">
      ${State.achievements.map(a => `
        <div class="ach ${a.on ? 'on' : ''}">
          <div class="ach-ico">${a.ico}</div>
          <h4>${esc(a.title)}</h4>
          <p>${esc(a.desc)}</p>
        </div>`).join('')}
    </div>
  `;
}

async function viewProfile() {
  if (!State.profile && !State.demo) {
    $('#view').innerHTML = `<div class="empty"><div class="e-ico">●</div>
      <h3>Not signed in</h3><p>Connect your wallet to build a profile.</p>
      <button class="btn btn-primary" data-action="wallet-toggle">Connect Phantom</button></div>`;
    return;
  }
  const p = State.profile || {
    handle: 'demo_clasher', xp: 4820, wins: 14, streak: 2,
    joined: new Date(Date.now() - 1000 * 60 * 60 * 24 * 26).toISOString(),
  };

  $('#view').innerHTML = `
    ${demoRibbon()}
    <div class="profile-head">
      <div class="p-avatar">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.handle || '?')[0].toUpperCase())}</div>
      <div class="p-info">
        <h1>${esc(p.handle)}</h1>
        <div class="p-handle">${State.wallet ? short(State.wallet.address) : 'no wallet'} ·
          ${State.xAccount ? '@' + esc(State.xAccount.handle) : 'X not linked'}</div>
        <div class="p-tags">
          <span class="badge accent">${esc(State.wallet?.tier || 'Unranked')}</span>
          <span class="badge">${p.streak || 0}🔥 streak</span>
          <span class="badge violet">Season 1</span>
        </div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:30px;font-weight:700;letter-spacing:-.03em">${fmt(p.xp)}</div>
        <div style="font-size:11px;color:var(--dim);font-family:var(--fm);text-transform:uppercase;letter-spacing:.1em">Total XP</div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><b>${p.wins || 0}</b><span>Correct predictions</span></div>
      <div class="stat"><b>${State.demo ? 38 : 0}</b><span>Votes cast</span></div>
      <div class="stat"><b>${State.demo ? 6 : 0}</b><span>Posts submitted</span></div>
      <div class="stat"><b>${State.demo ? '26d' : '—'}</b><span>Member since</span></div>
    </div>

    <div class="panel">
      <h3>Activity</h3>
      ${[
        { ico:'🗳️', t:'Voted in a live battle', s:'12 minutes ago' },
        { ico:'🔮', t:'Predicted correctly — +50 XP', s:'1 hour ago' },
        { ico:'📮', t:'Submitted a post to the queue', s:'3 hours ago' },
        { ico:'🔥', t:'Daily streak extended', s:'Yesterday' },
      ].map(a => `
        <div style="display:flex;gap:12px;padding:11px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:16px">${a.ico}</span>
          <div style="flex:1"><div style="font-size:13.5px">${a.t}</div>
            <div style="font-size:12px;color:var(--dim)">${a.s}</div></div>
        </div>`).join('')}
    </div>
  `;
}

async function viewSettings() {
  const tiers = await Data.loadTiers();
  const holder = State.wallet?.balance || 0;
  const current = [...tiers].reverse().find(t => holder >= t.req) || tiers[0];

  $('#view').innerHTML = `
    <div class="view-head">
      <h1>Settings</h1>
      <p>Wallet, X account and platform configuration.</p>
    </div>

    <div class="panel">
      <h3>Supabase</h3>
      <div class="row" style="padding:12px 14px">
        <div class="row-main">
          <div class="row-name">${IS_CONFIGURED ? '✅ Configured' : '⚠ Demo mode'}</div>
          <div class="row-sub">${IS_CONFIGURED
            ? esc(CONFIG.SUPABASE_URL)
            : 'Add SUPABASE_URL and SUPABASE_ANON_KEY to config.js'}</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>Phantom wallet</h3>
      <div class="row" style="padding:12px 14px">
        <div class="row-main">
          <div class="row-name">${State.wallet ? short(State.wallet.address) : 'Not connected'}</div>
          <div class="row-sub">${State.wallet?.verified ? 'Signature verified' : 'Unverified'}</div>
        </div>
        <button class="btn btn-sm ${State.wallet ? 'btn-danger' : 'btn-primary'}" data-action="wallet-toggle">
          ${State.wallet ? 'Disconnect' : 'Connect'}
        </button>
      </div>
      ${!Wallet.available() ? `<p class="hint">Phantom extension not detected in this browser.</p>` : ''}
    </div>

    <div class="panel">
      <h3>Token tier</h3>
      <p style="color:var(--muted);font-size:13.5px;margin-bottom:14px">
        Current: <b style="color:${current.color}">${esc(current.name)}</b> ·
        ${fmt(holder)} tokens held · ${current.mult}× XP multiplier
      </p>
      ${tiers.map(t => `
        <div class="row" style="padding:11px 14px">
          <div class="row-rank" style="background:${t.color}22;color:${t.color};border:1px solid ${t.color}55">
            ${t.req >= 1000 ? fmt(t.req) : t.req}
          </div>
          <div class="row-main">
            <div class="row-name" style="color:${t.color}">${esc(t.name)}</div>
            <div class="row-sub">Minimum ${fmt(t.req)} tokens</div>
          </div>
          <div class="row-val" style="color:${t.color}">${t.mult}×</div>
        </div>`).join('')}
    </div>

    <div class="panel">
      <h3>X account</h3>
      <div class="row" style="padding:12px 14px">
        <div class="row-main">
          <div class="row-name">${State.xAccount ? '@' + esc(State.xAccount.handle) : 'Not linked'}</div>
          <div class="row-sub">${CONFIG.X_OAUTH_START_URL ? 'OAuth 2.0 + PKCE' : 'X OAuth not configured'}</div>
        </div>
        ${State.xAccount
          ? `<button class="btn btn-sm btn-danger" id="btn-unlink-x">Unlink</button>`
          : `<button class="btn btn-sm btn-primary" id="btn-link-x" ${!CONFIG.X_OAUTH_START_URL ? 'disabled' : ''}>Link X</button>`}
      </div>
      ${!CONFIG.X_OAUTH_START_URL
        ? `<p class="hint">Set X_OAUTH_START_URL in config.js and deploy the x-oauth-start edge function.</p>` : ''}
    </div>
  `;

  $('#btn-link-x')?.addEventListener('click', () => {
    const url = `${CONFIG.X_OAUTH_START_URL}?redirect=${encodeURIComponent(location.origin + location.pathname)}`;
    location.href = url;
  });
  $('#btn-unlink-x')?.addEventListener('click', async () => {
    if (await confirmDialog('Unlink X account?', 'You will need to re-authorize to submit posts.')) {
      State.xAccount = null;
      if (!State.demo) await State.sb.from('x_accounts').delete().eq('user_id', State.profile.id);
      toast('X account unlinked');
      navigate();
    }
  });
}

async function viewAdmin() {
  if (!State.admin) {
    $('#view').innerHTML = `<div class="empty"><div class="e-ico">⚙</div>
      <h3>Admin access required</h3><p>Your account does not have the admin role.</p>
      <a class="btn btn-outline" href="#/arena">Back to Arena</a></div>`;
    return;
  }
  $('#view').innerHTML = `
    ${demoRibbon()}
    <div class="view-head">
      <h1>Moderation</h1>
      <p>Review reported content and settle battles. All actions are enforced server-side.</p>
    </div>
    <div class="panel">
      <h3>Open reports</h3>
      <div class="empty" style="padding:36px">
        <div class="e-ico">◈</div><h3>No open reports</h3>
        <p>Reported posts will appear here for review.</p>
      </div>
    </div>
    <div class="panel">
      <h3>Settlement</h3>
      <p style="color:var(--muted);font-size:13.5px;margin-bottom:14px">
        Settling a battle is idempotent — the edge function will reject a second call for the same round.
      </p>
      <button class="btn btn-violet" id="btn-settle">Run settlement for expired rounds</button>
    </div>
  `;
  $('#btn-settle')?.addEventListener('click', async () => {
    if (State.demo) { toast('Demo mode — settlement not executed', 'warn'); return; }
    const { data, error } = await State.sb.functions.invoke('battle-settle', { body: {} });
    if (error) toast('Settlement failed: ' + error.message, 'err');
    else toast(`Settled ${data?.settled ?? 0} round(s)`);
    await Data.loadBattles();
    navigate();
  });
}

/* ───────────────────────── XP ───────────────────────── */
async function grantXP(amount, reason) {
  if (State.demo) {
    State.profile ??= { handle: 'demo_clasher', xp: 4820, wins: 14, streak: 2 };
    State.profile.xp += amount;
    renderTopbar();
    return;
  }
  const { error } = await State.sb.rpc('award_xp', { p_amount: amount, p_reason: reason });
  if (error) console.warn('XP award failed:', error.message);
  await refreshProfile();
}

async function refreshProfile() {
  if (State.demo) {
    State.profile ??= { handle: 'demo_clasher', xp: 4820, wins: 14, streak: 2, avatar_url: null };
    renderTopbar();
    return;
  }
  if (!State.sb) return;
  const { data: { user } } = await State.sb.auth.getUser();
  if (!user) { renderTopbar(); return; }

  const { data: profile } = await State.sb.from('profiles').select('*').eq('id', user.id).single();
  State.profile = profile || { id: user.id, handle: 'clasher', xp: 0, wins: 0, streak: 0 };

  const { data: roles } = await State.sb.from('admin_roles').select('role').eq('user_id', user.id);
  State.admin = (roles || []).length > 0;
  $('.nav-admin').hidden = !State.admin;

  const { data: xa } = await State.sb.from('x_accounts').select('handle').eq('user_id', user.id).maybeSingle();
  State.xAccount = xa || null;

  renderTopbar();
}

/* ───────────────────────── Topbar render ───────────────────────── */
function renderTopbar() {
  const w = State.wallet;
  const pill = $('#wallet-pill');
  pill.classList.toggle('connected', !!w);
  $('#wp-addr').textContent = w ? short(w.address) : 'Connect';
  $('#wp-dot').style.background = w
    ? (w.verified ? 'var(--accent)' : 'var(--warn)')
    : 'var(--dim)';

  const tier = w?.tier || 'Unranked';
  $('#tier-value').textContent = tier;
  const colors = { Unranked:'#5A635A', Bronze:'#C08050', Silver:'#B8C4C0', Gold:'#FFB020', Diamond:'#39FF14' };
  $('#tier-dot').style.background = colors[tier] || 'var(--dim)';

  $('#xp-value').textContent = fmt(State.profile?.xp || 0);

  const p = State.profile;
  if (p?.avatar_url) {
    $('#avatar-img').src = p.avatar_url;
    $('#avatar-img').hidden = false;
    $('#avatar-fallback').hidden = true;
  } else {
    $('#avatar-fallback').textContent = (p?.handle || '?')[0].toUpperCase();
  }
}

/* ───────────────────────── Global event delegation ───────────────────────── */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-action], [data-vote], [data-react], [data-predict]');
  if (!t) return;

  /* Navigation */
  const action = t.dataset.action;
  if (action === 'go') { location.hash = t.dataset.href; return; }
  if (action === 'open-arena') {
    $('#landing').hidden = true;
    $('#app').hidden = false;
    location.hash = '#/arena';
    return;
  }
  if (action === 'wallet-toggle') {
    State.wallet ? Wallet.disconnect() : await Wallet.connect();
    return;
  }

  /* Vote */
  if (t.dataset.vote) {
    const battleId = t.dataset.vote;
    const entryId  = t.dataset.entry;
    if (!State.wallet) {
      toast('Connect your wallet to vote', 'warn');
      Wallet.connect();
      return;
    }
    try {
      await Data.castVote(battleId, entryId);
      toast('Vote recorded');
      await grantXP(CONFIG.XP.VOTE, 'vote');
      const b = State.battles.find(x => x.id === battleId);
      if (b) patchBattleCard(b);
    } catch (err) {
      toast(err.message || 'Vote failed', 'err');
    }
    return;
  }

  /* Reaction */
  if (t.dataset.react) {
    if (!State.wallet) { toast('Connect your wallet to react', 'warn'); return; }
    t.classList.toggle('on');
    if (!State.demo) {
      try { await Data.react(t.dataset.react, t.dataset.side, t.dataset.emoji); }
      catch { t.classList.toggle('on'); toast('Reaction failed', 'err'); }
    }
    return;
  }

  /* Predict */
  if (t.dataset.predict) {
    const battleId = t.dataset.predict;
    if (t.dataset.finished === 'true') return;
    if (!State.wallet) { toast('Connect your wallet to predict', 'warn'); return; }
    const b = State.battles.find(x => x.id === battleId);
    if (!b) return;

    modal({
      title: 'Predict the winner',
      body: `
        <p style="color:var(--muted);font-size:13.5px;margin-bottom:16px">
          Correct predictions earn ${CONFIG.XP.CORRECT_PREDICTION} XP. Predictions cannot be changed.
        </p>
        <div style="display:grid;gap:10px">
          <button class="btn btn-outline" data-pick="${b.entry_a.id}">
            ${esc(b.entry_a.post.handle)} — ${esc(b.entry_a.post.text.slice(0, 48))}…
          </button>
          <button class="btn btn-outline" data-pick="${b.entry_b.id}">
            ${esc(b.entry_b.post.handle)} — ${esc(b.entry_b.post.text.slice(0, 48))}…
          </button>
        </div>`,
      actions: [],
      width: '460px',
    });

    $('#modal-root').querySelectorAll('[data-pick]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await Data.predict(battleId, btn.dataset.pick);
          await grantXP(CONFIG.XP.PREDICT, 'prediction');
          toast('Prediction locked');
          $('#modal-root').hidden = true;
          $('#modal-root').innerHTML = '';
          navigate();
        } catch (err) { toast(err.message, 'err'); }
      };
    });
    return;
  }
});

/* Mobile menu */
$('#btn-menu')?.addEventListener('click', () => {
  const sb = $('#sidebar');
  const open = sb.classList.toggle('open');
  $('#btn-menu').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', e => {
  if (window.innerWidth > 980) return;
  const sb = $('#sidebar');
  if (!sb.classList.contains('open')) return;
  if (!e.target.closest('#sidebar') && !e.target.closest('#btn-menu')) {
    sb.classList.remove('open');
    $('#btn-menu').setAttribute('aria-expanded', 'false');
  }
});

/* Countdown ticker */
setInterval(() => {
  $$('[data-countdown]').forEach(el => {
    const ms = new Date(el.dataset.countdown).getTime() - Date.now();
    el.innerHTML = `<b>${countdown(ms)}</b>`;
  });
}, 1000);

/* ───────────────────────── Boot ───────────────────────── */
async function boot() {
  $('#yr').textContent = new Date().getFullYear();

  State.sb = await initSupabase();
  if (!State.sb) State.demo = true;

  // Load local vote/prediction state
  State.votes = LS.get('votes', {});
  State.predictions = LS.get('preds', {});

  // Landing tiers
  const tiers = await Data.loadTiers();
  $('#landing-tiers').innerHTML = tiers.map(t => `
    <div class="tier-card" style="--tc:${t.color}">
      <h4>${esc(t.name)}</h4>
      <div class="req">${t.req === 0 ? 'No minimum' : '≥ ' + fmt(t.req) + ' tokens'}</div>
      <div class="mult">${t.mult}× <small>XP multiplier</small></div>
    </div>`).join('');

  // Landing stats
  if (State.demo) {
    $('#hs-battles').textContent = '4';
    $('#hs-votes').textContent = '8.4K';
    $('#hs-users').textContent = '1.2K';
  } else {
    const { count } = await State.sb.from('battles').select('*', { count: 'exact', head: true }).eq('status', 'live');
    $('#hs-battles').textContent = fmt(count || 0);
    $('#hs-votes').textContent  = '—';
    $('#hs-users').textContent  = '—';
  }

  // Try wallet auto-reconnect
  await Wallet.autoReconnect();

  // Profile
  await refreshProfile();

  // Boot splash out
  $('#boot-note').textContent = 'Ready';
  setTimeout(() => {
    $('#boot-splash').classList.add('gone');
    $('#landing').hidden = false;
  }, 380);

  // Route handling
  window.addEventListener('hashchange', navigate);
  if (location.hash && location.hash !== '#/') {
    $('#landing').hidden = true;
    $('#app').hidden = false;
  }
  await navigate();
  Data.subscribeRealtime();
}

boot().catch(err => {
  console.error('[PostClash] boot failed', err);
  $('#boot-note').textContent = 'Boot failed — check console';
});
