// ==UserScript==
// @name         DB - Duel: Chess Clock
// @namespace    db-interface
// @version      0.2.1
// @description  Client-side 25-minute chess clock per player (MM:SS on each player's avatar; coloured while it runs). Start turn puts the turn player on the clock, Think keeps it, Ok passes it to the opponent, End turn hands it over; the turn player's game actions take it back. Clocks keep going across games and page refreshes and reset when a new match starts. Draws on the Zone Panel's player cards when that script is docked, else on DB's own avatars. Nothing is sent to the server.
// @author       vivaria
// @match        https://www.duelingbook.com/*
// @match        https://duelingbook.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__dbChessClock) return;
  window.__dbChessClock = true;

  const START_MS = 25 * 60 * 1000;
  const STORE_KEY = 'dbChessClock.v1';
  const DEBUG_KEY = 'dbChessClock.debug'; // dbChessClock.debug(true) in the console to log plays
  const SOLO_OPP = '__opponent__';       // clock key for the empty seat in solo mode
  const TICK_MS = 100;
  const SAVE_EVERY_MS = 1000;

  // Plays that are not "the turn player taking a game action".
  const META_PLAYS = new Set([
    'Thinking', 'Good', 'Stop good', 'Typing', 'Stop typing', 'Message', 'Duel message',
    'Countdown', 'RPS', 'Pick first', 'Ready', 'Siding', 'Siding with cards', 'Done siding',
    'Resume siding', 'Begin next duel', 'Back to RPS', 'Accept rematch', 'Admit defeat',
    'Quit duel', 'Left duel', 'Add watcher', 'Remove watcher', 'Shuffle hand',
    'Target card', 'Life points', 'Preview Skillback',
  ]);
  // Plays after which nobody should be on the clock until the next Start turn.
  const GAME_OVER_PLAYS = new Set(['Admit defeat', 'Quit duel', 'Begin next duel', 'Back to RPS', 'Siding']);

  const debug = () => { try { return localStorage.getItem(DEBUG_KEY) === '1'; } catch (e) { return false; } };
  const log = (...a) => { if (debug()) console.log('[chess clock]', ...a); };

  // ---- DuelingBook globals (may not exist yet) ----
  /* global duelId, duelHash, player1, player2, player3, player4, currentLabel, turn_player */
  const page = {
    matchId() { try { return duelId || duelHash || null; } catch (e) { return null; } },
    label() { try { return currentLabel; } catch (e) { return undefined; } },
    // DB's own record of whose turn it is. Set when the duel loads (also on a refresh or
    // when watching), by Pick first and in solo; it lags a moment behind Start turn.
    turnPlayerName() { try { return (turn_player && turn_player.username) || null; } catch (e) { return null; } },
    player(n) {
      try { return { 1: player1, 2: player2, 3: player3, 4: player4 }[n] || null; } catch (e) { return null; }
    },
    name(n) { const p = page.player(n); return (p && p.username) || null; },
  };

  // Clock keys: side 1 = player1's username, side 2 = player2's username (or SOLO_OPP).
  function sideKeys() {
    const p1 = page.name(1), p2 = page.name(2);
    return [p1, p2 && p2 !== p1 ? p2 : SOLO_OPP];
  }
  function keyOf(username) {
    if (!username) return null;
    const [k1, k2] = sideKeys();
    if (username === page.name(1) || username === page.name(3)) return k1 || username; // tag partner shares the clock
    if (k2 !== SOLO_OPP && (username === page.name(2) || username === page.name(4))) return k2;
    return username;
  }
  function opponentOf(key) {
    const [k1, k2] = sideKeys();
    if (key && key === k1) return k2;
    if (key && key === k2) return k1;
    return null;
  }

  // ---- State (persisted per match) ----
  const fresh = (matchId) => ({ matchId, clocks: {}, active: null, turnPlayer: null });
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && typeof s === 'object' && s.clocks) return s;
    } catch (e) { /* ignore */ }
    return fresh(null);
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  let state = load();
  const msLeft = (key) => (key && typeof state.clocks[key] === 'number' ? state.clocks[key] : START_MS);

  function newMatch(id, why) {
    state = fresh(id);
    save();
    log('new match', id, why);
  }
  // A different duel id than the stored one means a new match started. A refresh rejoins
  // the same id, so the stored clocks carry on; games inside a match keep the same id.
  function syncMatch() {
    const id = page.matchId();
    if (id && id !== state.matchId) newMatch(id, 'duel id changed');
  }

  function setActive(key, why) {
    if (state.active === key) return;
    state.active = key;
    save();
    log('active ->', key, '(' + why + ')');
  }

  function isGameAction(play) {
    return !!play && !META_PLAYS.has(play) && !play.startsWith('View') && !play.startsWith('Stop ');
  }

  // Whose turn it is. The first turn of a game has no Start turn (it goes Pick first ->
  // Draw card -> Enter SP), and the script may load mid-turn, so when no Start turn or
  // Pick first has been seen this game, fall back to DB's own turn_player.
  function turnPlayer() {
    return state.turnPlayer || keyOf(page.turnPlayerName());
  }

  function actorOf(msg) {
    if (msg.username) return msg.username;
    const lg = Array.isArray(msg.log) ? msg.log[0] : msg.log;
    return (lg && lg.username) || null;
  }

  function handlePlay(msg) {
    syncMatch();
    const play = msg.play;
    const who = keyOf(actorOf(msg));
    log('play', JSON.stringify(play), 'by', actorOf(msg), '->', who, '| turn player', turnPlayer());

    if (play === 'Accept rematch') { newMatch(page.matchId(), 'rematch'); return; }
    if (GAME_OVER_PLAYS.has(play)) { state.turnPlayer = null; setActive(null, play); return; }
    if (!who) return;

    // DB's Pick first response names the player who goes first (not the one who chose).
    if (play === 'Pick first') { state.turnPlayer = who; save(); return; }

    switch (play) {
      case 'Start turn':
        state.turnPlayer = who;
        setActive(who, 'start turn');
        break;
      case 'Thinking': // retain priority
        setActive(who, 'think');
        break;
      case 'Good': // pass priority (also the hold-to-keep-passing variant)
        setActive(opponentOf(who), 'ok');
        break;
      case 'End turn': // the next player is on the clock until they press Start turn
        setActive(opponentOf(who), 'end turn');
        break;
      default:
        if (who === turnPlayer() && isGameAction(play)) setActive(who, 'turn player acted: ' + play);
    }
  }

  // ---- Socket listener (read-only) ----
  // DB starts with `websocket = false` and replaces the
  // socket on every (re)connect, so re-attach whenever window.websocket changes.
  let socket = null;
  function onSocketMessage(ev) {
    const data = ev.data;
    if (typeof data !== 'string' || data.indexOf('"play"') < 0) return;
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    if (!msg || msg.action !== 'Duel' || typeof msg.play !== 'string') return;
    try { handlePlay(msg); } catch (e) { console.error('[chess clock]', e); }
  }
  function ensureSocket() {
    const ws = window.websocket;
    const live = ws && typeof ws.addEventListener === 'function' ? ws : null;
    if (live === socket) return;
    try { if (socket) socket.removeEventListener('message', onSocketMessage); } catch (e) { /* old socket gone */ }
    socket = live;
    if (socket) socket.addEventListener('message', onSocketMessage);
  }

  // ---- Clock + rendering ----
  // Ticks only while a game is actually being played (not during RPS, going-first choice
  // or siding). Time spent with the page closed is not charged to anyone.
  function isLive() {
    if (!page.matchId()) return false;
    const label = page.label();
    return typeof label === 'string' ? label.startsWith('duel_start') : true;
  }

  function fmt(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60), s = total % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  const STYLE = `
    .dbcc-clock {
      position: absolute; top: 4px; left: 4px; z-index: 60;
      padding: 2px 6px; border-radius: 4px;
      background: #000; color: #fff;
      border: 1px solid rgba(255,255,255,0.35);
      box-shadow: 0 1px 3px rgba(0,0,0,0.7);
      font: 700 12px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
      font-variant-numeric: tabular-nums; letter-spacing: 0.03em;
      pointer-events: none; user-select: none;
    }
    /* Zone Panel card: DB's own countdown already sits top-left, so go top-right. */
    #db-left-col .zp-av > .dbcc-clock { left: auto; right: 6px; top: 6px; z-index: 3; }
    .dbcc-clock.dbcc-active { background: #1d7fd6; border-color: #9fd0ff; }
    .dbcc-clock.dbcc-active.dbcc-low { background: #c62828; border-color: #ff9a9a; }
    .dbcc-clock.dbcc-out { background: #5a0000; color: #ffb3b3; }
  `;
  function injectStyle() {
    if (document.getElementById('dbcc-style')) return;
    const st = document.createElement('style');
    st.id = 'dbcc-style';
    st.textContent = STYLE;
    (document.head || document.documentElement).appendChild(st);
  }

  // Where to draw: [host element, DB player index (1 or 2)].
  function targets() {
    // Zone Panel docked: its player cards replace DB's avatars (which it hides).
    const col = document.getElementById('db-left-col');
    if (col && document.documentElement.classList.contains('zp-docked')) {
      const p2 = page.player(2);
      const youIdx = p2 && window.username && p2.username === window.username ? 2 : 1; // Zone Panel's sides()
      return [[col.querySelector('.zp-pc-you .zp-av'), youIdx], [col.querySelector('.zp-pc-opp .zp-av'), 3 - youIdx]];
    }
    return [[document.getElementById('avatar1'), 1], [document.getElementById('avatar2'), 2]];
  }

  function render(live) {
    const inDuel = !!page.matchId();
    const keys = sideKeys();
    const used = new Set();
    if (inDuel) {
      for (const [host, idx] of targets()) {
        if (!host) continue;
        let el = host.querySelector(':scope > .dbcc-clock');
        if (!el) {
          if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
          el = document.createElement('div');
          el.className = 'dbcc-clock';
          host.appendChild(el);
        }
        used.add(el);
        const key = keys[idx - 1];
        const ms = msLeft(key);
        const text = fmt(ms);
        if (el.textContent !== text) el.textContent = text;
        el.classList.toggle('dbcc-active', live && !!key && key === state.active);
        el.classList.toggle('dbcc-low', ms < 60 * 1000);
        el.classList.toggle('dbcc-out', ms <= 0);
      }
    }
    // Drop clocks left behind (duel over, or the Zone Panel docked/undocked).
    for (const el of document.querySelectorAll('.dbcc-clock')) if (!used.has(el)) el.remove();
  }

  let last = Date.now();
  let lastSave = 0;
  function tick() {
    const now = Date.now();
    const dt = now - last;
    last = now;
    try {
      ensureSocket();
      syncMatch();
      const live = isLive();
      if (live && state.active) {
        state.clocks[state.active] = Math.max(0, msLeft(state.active) - dt);
        if (now - lastSave >= SAVE_EVERY_MS) { save(); lastSave = now; }
      }
      render(live);
    } catch (e) { console.error('[chess clock]', e); }
  }

  injectStyle();
  setInterval(tick, TICK_MS);
  window.addEventListener('pagehide', save);

  // Console helpers: dbChessClock.state, dbChessClock.reset(), dbChessClock.debug(true)
  window.dbChessClock = {
    get state() { return JSON.parse(JSON.stringify(state)); },
    reset() { newMatch(page.matchId(), 'manual reset'); },
    debug(on) { try { localStorage.setItem(DEBUG_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } },
  };
})();
