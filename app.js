// ═══════════════════════════════════════════════════════════════
// POSTCLASH — APPLICATION
// Depends on: config.js (window.POSTCLASH_CONFIG)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const CFG = window.POSTCLASH_CONFIG || {};
  const IS_CONFIGURED = Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

  /* ── Helpers ─────────────────────────────────────────────── */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const short = a => a ? `${a.slice(0,4)}…${a.slice(-4)}` : '';
  const fmt = n => new Intl.NumberFormat('en', { notation: n > 9999 ? 'compact' : 'standard' }).format(n || 0);
  const countdown = ms => {
    if (ms <= 0) return '00:00:00';
    const t = Math.floor(ms / 1000);
    return [Math.floor(t/3600), Math.floor((t%3600)/60), t%60]
      .map(x => String(x).padStart(2, '0')).join(':');
  };

  /* ── Local storage ──────────────────────────────────────── */
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('pc_' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('pc_' + k, JSON.stringify(v)); } catch {} },
  };

  /* ── State ──────────────────────────────────────────────── */
  const State = {
    sb: null,
    demo: !IS_CONFIGURED,
    wallet: null,
    profile: null,
    battles: [],
    votes: LS.get('votes', {}),
    predictions: LS.get('preds', {}),
    route: 'arena',
  };

  /* ── Supabase init ──────────────────────────────────────── */
  function initSupabase() {
    if (!IS_CONFIGURED) return null;
    if (!window.supabase || !window.supabase.createClient) {
      console.warn('[PostClash] Supabase SDK not loaded');
      return null;
    }
    try {
      return window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 8 } },
      });
    } catch (e) {
      console.error('[PostClash] Supabase init failed', e);
      return null;
    }
  }

  /* ── Toast ──────────────────────────────────────────────── */
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, 3400);
  }

  /* ── Modal ──────────────────────────────────────────────── */
  function modal({ title, body, actions = [] }) {
    const root = $('#modal');
    root.hidden = false;
    root.innerHTML = `
      <div class="modal" role="dialog">
        <div class="modal-head"><h3>${esc(title)}</h3>
          <button class="icon-btn" data-close>✕</button></div>
        <div class="modal-body">${body}</div>
        ${actions.length ? `<div class="modal-foot">
          ${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-ghost'}" data-mact="${i}">${esc(a.label)}</button>`).join('')}
        </div>` : ''}
      </div>`;
    const close = () => { root.hidden = true; root.innerHTML = ''; };
    root.querySelector('[data-close]').onclick = close;
    root.onclick = e => { if (e.target === root) close(); };
    actions.forEach((a, i) => {
      const b = root.querySelector(`[data-mact="${i}"]`);
      if (b) b.onclick = () => { a.onClick?.(); if (a.autoClose !== false) close(); };
    });
    return { close };
  }

  /* ── Demo data ──────────────────────────────────────────── */
  const DEMO_POSTS = [
    { author:'Solana Labs', handle:'@solanalabs', text:'Solana processes 65,000 TPS at fractions of a cent. The chain that keeps shipping while others plan.', url:'https://x.com/solanalabs/status/1000000000000000001' },
    { author:'Anatoly K.',  handle:'@aeyakovenko', text:'The only metric that matters long-term is whether developers keep choosing to build.', url:'https://x.com/aeyakovenko/status/1000000000000000002' },
    { author:'Mert',        handle:'@mert',         text:'Retail does not care about your architecture diagram. They care that it works when they click the button.', url:'https://x.com/mert/status/1000000000000000003' },
    { author:'Raj',         handle:'@rajgokal',     text:'Every cycle the same argument: is it too early? The answer is always the same — build anyway.', url:'https://x.com/rajgokal/status/1000000000000000004' },
    { author:'Toly',        handle:'@toly',         text:'Latency is a product feature. Users feel 400ms. They do not feel your consensus mechanism.', url:'https://x.com/toly/status/1000000000000000005' },
    { author:'Superteam',   handle:'@superteam',    text:'The best builders in this ecosystem are the ones who shipped something ugly in week one.', url:'https://x.com/superteam/status/1000000000000000006' },
    { author:'Jupiter',     handle:'@JupiterExchange', text:'Routing is invisible when it works and catastrophic when it does not.', url:'https://x.com/JupiterExchange/status/1000000000000000007' },
    { author:'Phantom',     handle:'@phantom',      text:'A wallet is not a login screen. It is your identity, assets and reputation in one keypair.', url:'https://x.com/phantom/status/1000000000000000008' },
  ];

  function demoBattles() {
    const now = Date.now();
    const specs = [
      { off: -25*60*1000, va: 842,  vb: 617  },
      { off: -48*60*1000, va: 1290, vb: 1310 },
      { off: -52*60*1000, va: 2104, vb: 986  },
      { off: -55*60*1000, va: 431,  vb: 402  },
      { off: -95*60*1000, va: 3320, vb: 2180, done: true },
      { off: -140*60*1000,va: 780,  vb: 1180, done: true },
    ];
    return specs.map((s, i) => {
      const a = DEMO_POSTS[(i*2) % DEMO_POSTS.length];
      const b = DEMO_POSTS[(i*2+1) % DEMO_POSTS.length];
      const start = now + s.off;
      const end = start + 60*60*1000;
      const finished = s.done || end < now;
      return {
        id: 'demo-' + (i+1),
        status: finished ? 'finalized' : 'live',
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
        votes_a: s.va, votes_b: s.vb,
        winner: finished ? (s.va >= s.vb ? 'a' : 'b') : null,
        entry_a: { id: 'ea'+i, post: a },
        entry_b: { id: 'eb'+i, post: b },
      };
    });
  }

  function demoLeaderboard() {
    const names = ['noscope','0xVortex','SolSniper','gm_ser','PhantomKid','liquidityghost','degen_mike',
                   'moonboi','TolyFan42','ape_engineer','chadwick','sol_maxi','quiet_builder','nightowl','green_candle'];
    return names.map((n, i) => ({
      rank: i+1, handle: n,
      xp: 24000 - i*1370 + Math.floor(Math.random()*300),
      wins: 84 - i*4,
      streak: Math.max(0, 12 - i),
    }));
  }

  function demoQuests() {
    return [
      { id:'q1', ico:'🗳️', title:'Cast 5 votes',             desc:'Vote in any live battles',               prog:3, goal:5, xp:50,  done:false },
      { id:'q2', ico:'🔮', title:'Make 3 predictions',        desc:'Predict a winner before the round ends', prog:3, goal:3, xp:75,  done:true  },
      { id:'q3', ico:'📮', title:'Submit a post',             desc:'Submit any public X post URL',           prog:0, goal:1, xp:25,  done:false },
      { id:'q4', ico:'🔥', title:'Log in 3 days in a row',    desc:'Keep the streak alive',                  prog:2, goal:3, xp:60,  done:false },
      { id:'q5', ico:'🎯', title:'Predict 3 winners correctly',desc:'Accuracy matters',                       prog:1, goal:3, xp:150, done:false },
    ];
  }

  function demoAchievements() {
    return [
      { ico:'🥇', title:'First Blood',   desc:'Cast your first vote',    on:true  },
      { ico:'🔮', title:'Oracle',        desc:'10 correct predictions',  on:true  },
      { ico:'⚡', title:'Speed Demon',   desc:'Vote within 60s of live', on:true  },
      { ico:'💎', title:'Diamond Hands', desc:'Hold token 30 days',      on:false },
      { ico:'🏆', title:'Top 10',        desc:'Reach top 10 global',     on:false },
      { ico:'🔥', title:'Unstoppable',   desc:'30 day streak',           on:false },
      { ico:'🎪', title:'Clash Master',  desc:'Win 100 predictions',     on:false },
      { ico:'🌐', title:'Founder',       desc:'Join in season 1',        on:true  },
    ];
  }

  function demoTiers() {
    return [
      { name:'Unranked', req:0,       mult:1.0,  color:'#5A635A' },
      { name:'Bronze',   req:1000,    mult:1.1,  color:'#C08050' },
      { name:'Silver',   req:10000,   mult:1.25, color:'#B8C4C0' },
      { name:'Gold',     req:50000,   mult:1.5,  color:'#FFB020' },
      { name:'Diamond',  req:250000,  mult:2.0,  color:'#39FF14' },
    ];
  }

  /* ── Data layer ─────────────────────────────────────────── */
  async function loadBattles() {
    if (State.demo) { State.battles = demoBattles(); return State.battles; }
    const { data, error } = await State.sb
      .from('battles')
      .select(`id, status, starts_at, ends_at, winner,
               entry_a:battle_entries!inner(id, side, post:posts(*)),
               entry_b:battle_entries!inner(id, side, post:posts(*))`)
      .in('status', ['scheduled','live','finalized'])
      .order('ends_at', { ascending: true })
      .limit(40);
    if (error) { toast('Could not load battles: ' + error.message, 'err'); return []; }

    const ids = (data || []).map(b => b.id);
    const counts = {};
    if (ids.length) {
      const { data: votes } = await State.sb.from('votes').select('battle_id,entry_id').in('battle_id', ids);
      (votes || []).forEach(v => {
        counts[v.battle_id] ??= {};
        counts[v.battle_id][v.entry_id] = (counts[v.battle_id][v.entry_id] || 0) + 1;
      });
    }

    State.battles = (data || []).map(b => {
      const ea = (b.entry_a || []).find(x => x.side === 'a') || (b.entry_a || [])[0];
      const eb = (b.entry_b || []).find(x => x.side === 'b') || (b.entry_b || [])[0];
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
  }

  async function loadLeaderboard() {
    if (State.demo) return demoLeaderboard();
    const { data, error } = await State.sb.from('profiles')
      .select('handle, xp, wins, streak, avatar_url')
      .order('xp', { ascending: false }).limit(50);
    if (error) { toast('Leaderboard unavailable', 'err'); return []; }
    return (data || []).map((r, i) => ({ rank: i+1, ...r }));
  }

  async function loadTiers() {
    if (State.demo) return demoTiers();
    const { data } = await State.sb.from('token_tiers').select('*').order('min_amount');
    return (data || []).map(t => ({
      name: t.name, req: t.min_amount, mult: t.xp_multiplier, color: t.color || '#39FF14',
    }));
  }

  async function castVote(battleId, entryId) {
    if (State.demo) {
      if (State.votes[battleId]) throw new Error('You already voted in this battle.');
      State.votes[battleId] = entryId;
      LS.set('votes', State.votes);
      const b = State.battles.find(x => x.id === battleId);
      if (b) { if (b.entry_a.id === entryId) b.votes_a++; else b.votes_b++; }
      return true;
    }
    const { error } = await State.sb.from('votes').insert({ battle_id: battleId, entry_id: entryId });
    if (error) throw error;
    State.votes[battleId] = entryId;
    return true;
  }

  async function castPrediction(battleId, entryId) {
    if (State.demo) {
      if (State.predictions[battleId]) throw new Error('Prediction already locked.');
      State.predictions[battleId] = entryId;
      LS.set('preds', State.predictions);
      return true;
    }
    const { error } = await State.sb.from('predictions').insert({ battle_id: battleId, entry_id: entryId });
    if (error) throw error;
    State.predictions[battleId] = entryId;
    return true;
  }

  /* ── Realtime ───────────────────────────────────────────── */
  function subscribeRealtime() {
    if (State.demo || !State.sb) return;
    State.sb.channel('pc')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, p => {
        const b = State.battles.find(x => x.id === p.new.battle_id);
        if (!b) return;
        if (b.entry_a?.id === p.new.entry_id) b.votes_a++;
        else if (b.entry_b?.id === p.new.entry_id) b.votes_b++;
        patchBattle(b);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'battles' }, p => {
        const b = State.battles.find(x => x.id === p.new.id);
        if (b) { Object.assign(b, { status: p.new.status, winner: p.new.winner }); patchBattle(b); }
      })
      .subscribe();
  }

  /* ── Wallet ─────────────────────────────────────────────── */
  const Wallet = {
    provider() {
      return window.phantom?.solana?.isPhantom ? window.phantom.solana
           : window.solana?.isPhantom ? window.solana : null;
    },
    available() { return !!this.provider(); },

    async connect() {
      const p = this.provider();
      if (!p) {
        modal({
          title: 'Phantom not detected',
          body: `<p style="color:var(--muted);font-size:14px;margin-bottom:14px">
            Install the Phantom browser extension to connect.</p>
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
        const r1 = await fetch(`${CFG.SUPABASE_URL}/functions/v1/wallet-nonce`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        });
        if (!r1.ok) throw new Error('nonce request failed');
        const { nonce, message } = await r1.json();

        const encoded = new TextEncoder().encode(message);
        const { signature } = await provider.signMessage(encoded, 'utf8');
        const sigB64 = btoa(String.fromCharCode(...signature));

        const r2 = await fetch(`${CFG.SUPABASE_URL}/functions/v1/wallet-verify`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, nonce, signature: sigB64 }),
        });
        if (!r2.ok) throw new Error('verification failed');
        const v = await r2.json();

        State.wallet.verified = true;
        State.wallet.balance = v.balance || 0;
        State.wallet.tier = v.tier || 'Unranked';
        renderTopbar();
        toast(`Verified · ${v.tier} tier`);
      } catch (e) {
        State.wallet.verified = false;
        toast('Signature verification failed', 'err');
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
  };

  /* ── Battle card ────────────────────────────────────────── */
  function battleStatus(b) {
    const now = Date.now();
    const start = new Date(b.starts_at).getTime();
    const end = new Date(b.ends_at).getTime();
    if (b.status === 'finalized') return { cls: 'finished', label: 'FINISHED' };
    if (b.status === 'cancelled') return { cls: 'finished', label: 'CANCELLED' };
    if (now < start) return { cls: 'finished', label: 'SCHEDULED' };
    if (end - now <= (CFG.ENDING_SOON_SECONDS || 300) * 1000) return { cls: 'ending', label: 'ENDING SOON' };
    return { cls: 'live', label: 'LIVE' };
  }

  function battleCard(b) {
    const st = battleStatus(b);
    const total = (b.votes_a + b.votes_b) || 1;
    const pctA = Math.round((b.votes_a / total) * 100);
    const pctB = 100 - pctA;
    const myVote = State.votes[b.id];
    const myPred = State.predictions[b.id];
    const finished = b.status === 'finalized';
    const canVote = !finished && !myVote;

    const side = (s, e, cls) => {
      const post = e?.post || {};
      const isWinner = finished && b.winner === s;
      return `<div class="side ${isWinner ? 'winner' : ''}">
        <div class="side-author">
          <div class="side-av">${esc((post.author || '?')[0])}</div>
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
        <button class="vote-btn ${cls} ${myVote === e?.id ? 'voted' : ''}"
                data-vote="${b.id}" data-entry="${e?.id}"
                ${!canVote ? 'disabled' : ''}>
          ${myVote === e?.id ? '✓ Voted' : finished ? 'Closed' : 'Vote'}
        </button>
      </div>`;
    };

    return `<article class="battle" data-battle="${b.id}">
      <div class="battle-head">
        <span class="status ${st.cls}">${st.label}</span>
        <span class="battle-timer" data-countdown="${b.ends_at}">
          <b>${countdown(new Date(b.ends_at) - Date.now())}</b>
        </span>
      </div>
      <div class="votebar">
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
          `<button class="react" data-react="${b.id}" data-emoji="${e}">${e}</button>`).join('')}
        <button class="btn btn-ghost btn-sm" style="margin-left:auto"
                data-predict="${b.id}" ${finished || myPred ? 'disabled' : ''}>
          ${myPred ? '🔮 Locked' : '🔮 Predict'}
        </button>
      </div>
      <div class="battle-foot">
        ${b.id.slice(0, 16)} · ${fmt(total)} votes
        ${finished && b.winner ? ` · Winner: Side ${b.winner.toUpperCase()}` : ''}
      </div>
    </article>`;
  }

  function patchBattle(b) {
    const el = document.querySelector(`[data-battle="${b.id}"]`);
    if (!el) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = battleCard(b);
    el.replaceWith(wrap.firstElementChild);
  }

  /* ── Demo ribbon ────────────────────────────────────────── */
  function demoRibbon() {
    if (!State.demo) return '';
    return `<div class="demo-banner">
      <span>◈</span><b>DEMO MODE</b> — sample data.
      <a href="#/settings">Configure Supabase →</a>
    </div>`;
  }

  /* ── Views ──────────────────────────────────────────────── */
  async function viewArena() {
    if (!State.battles.length) await loadBattles();
    const live = State.battles.filter(b => b.status === 'live');
    const done = State.battles.filter(b => b.status === 'finalized');

    $('#view').innerHTML = `
      ${demoRibbon()}
      <div class="view-head">
        <h1>Arena</h1>
        <p>Two posts enter. One wins. Vote in live rounds and watch counts update in real time.</p>
      </div>
      <div class="stats">
        <div class="stat"><b>${live.length}</b><span>Live battles</span></div>
        <div class="stat"><b>${fmt(live.reduce((s,b)=>s+b.votes_a+b.votes_b,0))}</b><span>Votes in play</span></div>
        <div class="stat"><b>${done.length}</b><span>Settled</span></div>
        <div class="stat"><b>${fmt(State.profile?.xp || 0)}</b><span>Your XP</span></div>
      </div>
      ${live.length
        ? `<h2 style="font-size:16px;margin:26px 0 14px">Live now</h2>
           <div>${live.map(battleCard).join('')}</div>`
        : `<div class="empty"><div class="ico">◈</div><h3>No live battles</h3>
             <p>Rounds start on a schedule.</p></div>`}
      ${done.length
        ? `<h2 style="font-size:16px;margin:34px 0 14px">Recently settled</h2>
           <div>${done.slice(0,6).map(battleCard).join('')}</div>`
        : ''}
    `;
  }

  async function viewDiscover() {
    const canSubmit = State.wallet?.verified;

    $('#view').innerHTML = `
      ${demoRibbon()}
      <div class="view-head">
        <h1>Discover</h1>
        <p>Paste a public X post URL to enter it into an upcoming round.</p>
      </div>
      <div class="panel" style="margin-bottom:20px">
        <h3>Submit a post</h3>
        <div class="field">
          <label for="post-url">X post URL</label>
          <input class="input" id="post-url" type="url" placeholder="https://x.com/handle/status/1234567890" />
          <p class="hint" id="url-hint">Format: https://x.com/&lt;handle&gt;/status/&lt;id&gt;</p>
        </div>
        <button class="btn btn-primary" id="btn-submit-post" ${canSubmit ? '' : 'disabled'}>
          ${canSubmit ? 'Submit post' : 'Connect & verify wallet first'}
        </button>
      </div>
      <div class="panel">
        <h3>Recently submitted</h3>
        ${DEMO_POSTS.slice(0,5).map((p, i) => `
          <div class="row">
            <div class="row-rank">${i+1}</div>
            <div class="row-main">
              <div class="row-name">${esc(p.author)} <span class="badge">${esc(p.handle)}</span></div>
              <div class="row-sub">${esc(p.text.slice(0, 70))}…</div>
            </div>
          </div>`).join('')}
      </div>
    `;

    const inp = $('#post-url');
    if (inp) {
      inp.addEventListener('input', () => {
        const ok = /^https?:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/.test(inp.value.trim());
        inp.classList.toggle('err', inp.value.length > 0 && !ok);
        $('#url-hint').className = 'hint' + (inp.value.length > 0 && !ok ? ' err' : '');
        $('#url-hint').textContent = inp.value.length > 0 && !ok
          ? 'Not a valid X post URL'
          : 'Format: https://x.com/<handle>/status/<id>';
        $('#btn-submit-post').disabled = !ok || !canSubmit;
      });
    }
    $('#btn-submit-post')?.addEventListener('click', () => submitPost(inp.value.trim()));
  }

  async function submitPost(url) {
    if (State.demo) { toast('Demo mode — post accepted locally', 'warn'); return; }
    const { error } = await State.sb.from('posts').insert({ url, status: 'pending' });
    if (error) {
      if (error.code === '23505') toast('Already submitted', 'warn');
      else toast('Submission failed: ' + error.message, 'err');
      return;
    }
    toast('Post submitted — awaiting round assignment');
    inp.value = '';
  }

  async function viewPredictions() {
    if (!State.battles.length) await loadBattles();
    const open = State.battles.filter(b => b.status === 'live');

    $('#view').innerHTML = `
      ${demoRibbon()}
      <div class="view-head">
        <h1>Predictions</h1>
        <p>Call the winner before the round ends. Correct calls earn XP. No wagers.</p>
      </div>
      <div class="stats">
        <div class="stat"><b>${Object.keys(State.predictions).length}</b><span>Your predictions</span></div>
        <div class="stat"><b>${CFG.XP.PREDICT}</b><span>XP per prediction</span></div>
        <div class="stat"><b>${CFG.XP.CORRECT_PREDICTION}</b><span>XP if correct</span></div>
      </div>
      ${open.length ? open.map(b => {
        const locked = State.predictions[b.id];
        return `<div class="row">
          <div class="row-rank">🔮</div>
          <div class="row-main">
            <div class="row-name">${esc(b.entry_a.post.handle)} vs ${esc(b.entry_b.post.handle)}</div>
            <div class="row-sub">Ends in ${countdown(new Date(b.ends_at) - Date.now())}</div>
          </div>
          ${locked
            ? `<span class="badge violet">Locked</span>`
            : `<button class="btn btn-violet btn-sm" data-predict="${b.id}">Predict</button>`}
        </div>`;
      }).join('') : `<div class="empty"><div class="ico">◎</div>
        <h3>No open battles</h3><p>Predictions open when a round goes live.</p></div>`}
    `;
  }

  async function viewLeaderboard() {
    const rows = await loadLeaderboard();
    $('#view').innerHTML = `
      ${demoRibbon()}
      <div class="view-head">
        <h1>Leaderboard</h1>
        <p>Ranked by XP earned through votes, predictions and quests.</p>
      </div>
      ${rows.map((r, i) => `
        <div class="row">
          <div class="row-rank ${i < 3 ? 'top' : ''}">${i+1}</div>
          <div class="row-main">
            <div class="row-name">${esc(r.handle || 'anon')}
              ${i === 0 ? '<span class="badge accent">LEADER</span>' : ''}</div>
            <div class="row-sub">${r.wins || 0} correct · ${r.streak || 0}d streak</div>
          </div>
          <div class="row-val">${fmt(r.xp)} XP</div>
        </div>`).join('')}
    `;
  }

  async function viewQuests() {
    const quests = State.demo ? demoQuests() : [];
    const achs = State.demo ? demoAchievements() : [];

    $('#view').innerHTML = `
      ${demoRibbon()}
      <div class="view-head">
        <h1>Quests & achievements</h1>
        <p>Daily objectives refresh every 24 hours.</p>
      </div>
      <div class="stats">
        <div class="stat"><b>${quests.filter(q=>q.done).length}/${quests.length}</b><span>Quests done</span></div>
        <div class="stat"><b>${achs.filter(a=>a.on).length}/${achs.length}</b><span>Achievements</span></div>
        <div class="stat"><b>${fmt(State.profile?.xp || 0)}</b><span>Total XP</span></div>
      </div>
      <h2 style="font-size:16px;margin:10px 0 14px">Daily quests</h2>
      ${quests.map(q => `
        <div class="quest ${q.done ? 'done' : ''}">
          <div class="quest-ico">${q.ico}</div>
          <div class="quest-main">
            <h4>${esc(q.title)} ${q.done ? '<span class="badge accent">DONE</span>' : ''}</h4>
            <p>${esc(q.desc)}</p>
            <div class="progress"><i style="width:${Math.min(100, (q.prog/q.goal)*100)}%"></i></div>
          </div>
          <div class="quest-xp">+${q.xp} XP</div>
        </div>`).join('')}
      <h2 style="font-size:16px;margin:34px 0 14px">Achievements</h2>
      <div class="ach-grid">
        ${achs.map(a => `
          <div class="ach ${a.on ? 'on' : ''}">
            <div class="ach-ico">${a.ico}</div>
            <h4>${esc(a.title)}</h4>
            <p>${esc(a.desc)}</p>
          </div>`).join('')}
      </div>
    `;
  }

  async function viewProfile() {
    const p = State.profile || (State.demo ? { handle: 'demo_clasher', xp: 4820, wins: 14, streak: 2 } : null);
    if (!p) {
      $('#view').innerHTML = `<div class="empty"><div class="ico">●</div>
        <h3>Not signed in</h3><p>Connect your wallet to build a profile.</p>
        <button class="btn btn-primary" data-action="wallet-toggle">Connect Phantom</button></div>`;
      return;
    }
    $('#view').innerHTML = `
      ${demoRibbon()}
      <div class="profile-head">
        <div class="p-avatar">${esc((p.handle || '?')[0].toUpperCase())}</div>
        <div class="p-info">
          <h1>${esc(p.handle)}</h1>
          <div class="p-handle">${State.wallet ? short(State.wallet.address) : 'no wallet'}</div>
          <div class="p-tags">
            <span class="badge accent">${esc(State.wallet?.tier || 'Unranked')}</span>
            <span class="badge">${p.streak || 0}🔥 streak</span>
            <span class="badge violet">Season 1</span>
          </div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:30px;font-weight:700;letter-spacing:-.03em">${fmt(p.xp)}</div>
          <div style="font-size:11px;color:var(--dim);font-family:var(--fm);text-transform:uppercase">Total XP</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><b>${p.wins || 0}</b><span>Correct predictions</span></div>
        <div class="stat"><b>${State.demo ? 38 : 0}</b><span>Votes cast</span></div>
        <div class="stat"><b>${State.demo ? 6 : 0}</b><span>Posts submitted</span></div>
      </div>
    `;
  }

  async function viewSettings() {
    const tiers = await loadTiers();
    const holder = State.wallet?.balance || 0;
    const current = [...tiers].reverse().find(t => holder >= t.req) || tiers[0];

    $('#view').innerHTML = `
      <div class="view-head"><h1>Settings</h1><p>Wallet, tiers and configuration.</p></div>

      <div class="panel">
        <h3>Supabase</h3>
        <div class="row">
          <div class="row-main">
            <div class="row-name">${IS_CONFIGURED ? '✅ Configured' : '⚠ Demo mode'}</div>
            <div class="row-sub">${IS_CONFIGURED ? esc(CFG.SUPABASE_URL) : 'Fill in config.js'}</div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>Phantom wallet</h3>
        <div class="row">
          <div class="row-main">
            <div class="row-name">${State.wallet ? short(State.wallet.address) : 'Not connected'}</div>
            <div class="row-sub">${State.wallet?.verified ? 'Signature verified' : 'Unverified'}</div>
          </div>
          <button class="btn btn-sm ${State.wallet ? 'btn-danger' : 'btn-primary'}" data-action="wallet-toggle">
            ${State.wallet ? 'Disconnect' : 'Connect'}
          </button>
        </div>
        ${!Wallet.available() ? '<p class="hint">Phantom extension not detected.</p>' : ''}
      </div>

      <div class="panel">
        <h3>Token tier</h3>
        <p style="color:var(--muted);font-size:13.5px;margin-bottom:14px">
          Current: <b style="color:${current.color}">${esc(current.name)}</b> ·
          ${fmt(holder)} tokens · ${current.mult}× XP
        </p>
        ${tiers.map(t => `
          <div class="row">
            <div class="row-rank" style="background:${t.color}22;color:${t.color}">
              ${t.req >= 1000 ? fmt(t.req) : t.req}
            </div>
            <div class="row-main">
              <div class="row-name" style="color:${t.color}">${esc(t.name)}</div>
              <div class="row-sub">Minimum ${fmt(t.req)} tokens</div>
            </div>
            <div class="row-val" style="color:${t.color}">${t.mult}×</div>
          </div>`).join('')}
      </div>
    `;
  }

  /* ── Router ─────────────────────────────────────────────── */
  const ROUTES = {
    arena:       { title: 'Arena',       render: viewArena },
    discover:    { title: 'Discover',    render: viewDiscover },
    predictions: { title: 'Predictions', render: viewPredictions },
    leaderboard: { title: 'Leaderboard', render: viewLeaderboard },
    quests:      { title: 'Quests',      render: viewQuests },
    profile:     { title: 'Profile',     render: viewProfile },
    settings:    { title: 'Settings',    render: viewSettings },
  };

  async function navigate() {
    const hash = location.hash.replace(/^#\/?/, '') || 'arena';
    const route = ROUTES[hash] ? hash : 'arena';

    $$('.nav a, .mobile-nav a').forEach(a =>
      a.classList.toggle('active', a.dataset.nav === route));

    $('#view-title').textContent = ROUTES[route].title;
    $('#view').innerHTML = '<div style="height:120px;background:linear-gradient(90deg,#141814,#1B211B,#141814);border-radius:8px"></div>';

    try { await ROUTES[route].render(); }
    catch (e) {
      console.error(e);
      $('#view').innerHTML = `<div class="empty"><div class="ico">⚠</div>
        <h3>Something went wrong</h3><p>${esc(e.message || 'Unknown error')}</p></div>`;
    }
    window.scrollTo(0, 0);
  }

  /* ── Topbar render ──────────────────────────────────────── */
  function renderTopbar() {
    const w = State.wallet;
    const pill = $('#wallet-pill');
    pill.classList.toggle('connected', !!w);
    $('#wp-addr').textContent = w ? short(w.address) : 'Connect';
    $('#wp-dot').style.background = w ? (w.verified ? 'var(--accent)' : 'var(--warn)') : 'var(--dim)';

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

  /* ── Global click handler ───────────────────────────────── */
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-action], [data-vote], [data-react], [data-predict]');
    if (!t) return;

    const action = t.dataset.action;
    if (action === 'go') { location.hash = t.dataset.href; return; }
    if (action === 'enter-app') {
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
      if (!State.wallet) { toast('Connect your wallet to vote', 'warn'); Wallet.connect(); return; }
      try {
        await castVote(t.dataset.vote, t.dataset.entry);
        toast('Vote recorded');
        const b = State.battles.find(x => x.id === t.dataset.vote);
        if (b) patchBattle(b);
      } catch (err) { toast(err.message, 'err'); }
      return;
    }

    /* React */
    if (t.dataset.react) {
      if (!State.wallet) { toast('Connect your wallet to react', 'warn'); return; }
      t.classList.toggle('on');
      return;
    }

    /* Predict */
    if (t.dataset.predict) {
      if (!State.wallet) { toast('Connect your wallet to predict', 'warn'); return; }
      const b = State.battles.find(x => x.id === t.dataset.predict);
      if (!b) return;
      modal({
        title: 'Predict the winner',
        body: `<p style="color:var(--muted);font-size:13.5px;margin-bottom:16px">
          Correct predictions earn ${CFG.XP.CORRECT_PREDICTION} XP. Cannot be changed.
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
      });
      document.querySelectorAll('[data-pick]').forEach(btn => {
        btn.onclick = async () => {
          try {
            await castPrediction(b.id, btn.dataset.pick);
            toast('Prediction locked');
            $('#modal').hidden = true;
            $('#modal').innerHTML = '';
            navigate();
          } catch (err) { toast(err.message, 'err'); }
        };
      });
    }
  });

  /* Mobile menu */
  $('#btn-menu')?.addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  /* Countdown ticker */
  setInterval(() => {
    $$('[data-countdown]').forEach(el => {
      const ms = new Date(el.dataset.countdown).getTime() - Date.now();
      el.innerHTML = `<b>${countdown(ms)}</b>`;
    });
  }, 1000);

  /* ── Boot ───────────────────────────────────────────────── */
  async function boot() {
    $('#yr').textContent = new Date().getFullYear();

    State.sb = initSupabase();
    if (!State.sb) State.demo = true;

    // Landing tiers
    const tiers = await loadTiers();
    $('#landing-tiers').innerHTML = tiers.map(t => `
      <div class="tier" style="--tc:${t.color}">
        <h4>${esc(t.name)}</h4>
        <div class="req">${t.req === 0 ? 'No minimum' : '≥ ' + fmt(t.req) + ' tokens'}</div>
        <div class="mult">${t.mult}× <small>XP</small></div>
      </div>`).join('');

    // Landing stats
    if (State.demo) {
      $('#hs-battles').textContent = '4';
      $('#hs-votes').textContent = '8.4K';
      $('#hs-users').textContent = '1.2K';
    } else {
      const { count } = await State.sb.from('battles').select('*', { count: 'exact', head: true }).eq('status', 'live');
      $('#hs-battles').textContent = fmt(count || 0);
      $('#hs-votes').textContent = '—';
      $('#hs-users').textContent = '—';
    }

    // Boot splash
    $('#boot-note').textContent = 'Ready';
    setTimeout(() => {
      $('#boot').classList.add('gone');
      $('#landing').hidden = false;
    }, 400);

    // Routing
    window.addEventListener('hashchange', navigate);
    if (location.hash && location.hash !== '#/') {
      $('#landing').hidden = true;
      $('#app').hidden = false;
    }
    await navigate();
    subscribeRealtime();
  }

  boot().catch(err => {
    console.error('[PostClash] boot failed', err);
    $('#boot-note').textContent = 'Boot failed — check console';
  });

})();
