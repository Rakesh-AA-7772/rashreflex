const STORAGE = {
  profile: 'reflexzero.profile',
  board: 'reflexzero.board',
  recent: 'reflexzero.recent',
  daily: 'reflexzero.daily',
  session: 'reflexzero.session',
};

const $ = (id) => document.getElementById(id);

const els = {
  statusText: $('statusText'),
  authView: $('authView'),
  playView: $('playView'),
  boardView: $('boardView'),
  statsView: $('statsView'),
  dossierView: $('dossierView'),
  briefView: $('briefView'),
  navTabs: [...document.querySelectorAll('.nav-tab')],
  navBrandClick: $('navBrandClick'),
  nicknameForm: $('nicknameForm'),
  nicknameInput: $('nicknameInput'),
  nicknameColor: $('nicknameColor'),
  colorBtns: [...document.querySelectorAll('.color-btn')],
  authStatus: $('authStatus'),
  deployBtn: $('deployBtn'),
  gameStage: $('gameStage'),
  gameButton: $('gameButton'),
  signalBars: $('signalBars'),
  stageTitle: $('stageTitle'),
  stageCopy: $('stageCopy'),
  feedbackZone: $('feedbackZone'),
  feedbackMain: $('feedbackMain'),
  feedbackSub: $('feedbackSub'),
  feedbackAgainBtn: $('feedbackAgainBtn'),
  tooSlowIndicator: $('tooSlowIndicator'),
  comboValue: $('comboValue'),
  threatLevel: $('threatLevel'),
  staminaLevel: $('staminaLevel'),
  lastResult: $('lastResult'),
  bestResult: $('bestResult'),
  rankResult: $('rankResult'),
  sessionClock: $('sessionClock'),
  dailyChallengeCard: $('dailyChallengeCard'),
  dcTarget: $('dcTarget'),
  dcCompletions: $('dcCompletions'),
  dcStatus: $('dcStatus'),
  sparklineContainer: $('sparklineContainer'),
  boardList: $('leaderboardList'),
  boardViewList: $('boardViewList'),
  statsBestTime: $('statsBestTime'),
  statsAvgTime: $('statsAvgTime'),
  statsLastTime: $('statsLastTime'),
  statsAttempts: $('statsAttempts'),
  statsRank: $('statsRank'),
  statsTier: $('statsTier'),
  statsBestTime2: $('statsBestTime2'),
  statsAvgTime2: $('statsAvgTime2'),
  statsLastTime2: $('statsLastTime2'),
  statsAttempts2: $('statsAttempts2'),
  statsRank2: $('statsRank2'),
  statsTier2: $('statsTier2'),
  profileNickname: $('profileNickname'),
  profileFaction: $('profileFaction'),
  profileTier: $('profileTier'),
  profileId: $('profileId'),
  profileSwatch: $('profileNicknameColorPreview'),
  resetStatsBtn: $('resetStatsBtn'),
  resetStatsBtn2: $('resetStatsBtn2'),
  tierPromotion: $('tierPromotion'),
  tierPromotionClose: $('tierPromotionClose'),
  tierPromotionContinue: $('tierPromotionContinue'),
  tierPromotionName: $('tierPromotionName'),
  tierPromotionDesc: $('tierPromotionDesc'),
  tierPromotionThreshold: $('tierPromotionThreshold'),
  difficultySwitch: $('difficultySwitch'),
};

const FACTIONS = {
  alpha: { label: 'ALPHA', color: '#00ff41' },
  bravo: { label: 'BRAVO', color: '#40d9ff' },
  omega: { label: 'OMEGA', color: '#ff4fd8' },
};

const DIFFICULTIES = [
  { key: 'easy', label: 'EASY', waitMin: 800, waitMax: 1500 },
  { key: 'medium', label: 'MEDIUM', waitMin: 520, waitMax: 1250 },
  { key: 'hard', label: 'HARD', waitMin: 320, waitMax: 980 },
];

const TIERS = [
  { name: 'ZERO', maxMs: 120, color: '#d9f5ff', description: 'You have reached the highest tier.' },
  { name: 'APEX', maxMs: 180, color: '#7affc1', description: 'Elite reaction speed.' },
  { name: 'ELITE', maxMs: 250, color: '#b9f2ff', description: 'Among the fastest on the board.' },
  { name: 'OPERATIVE', maxMs: 350, color: '#ffd86b', description: 'Sharp and consistent.' },
  { name: 'RECRUIT', maxMs: Infinity, color: '#8ca0b3', description: 'Everyone starts somewhere.' },
];

const state = {
  profile: null,
  records: [],
  recentTimes: [],
  currentView: 'auth',
  currentDifficulty: 'easy',
  phase: 'idle',
  startTime: 0,
  waitTimer: null,
  sessionStart: performance.now(),
  combo: 0,
  sessionBestCombo: 0,
  sessionId: Math.random().toString(16).slice(2, 6).toUpperCase(),
  currentDaily: null,
};

function safeParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function save() {
  localStorage.setItem(STORAGE.profile, JSON.stringify(state.profile));
  localStorage.setItem(STORAGE.board, JSON.stringify(state.records));
  localStorage.setItem(STORAGE.recent, JSON.stringify(state.recentTimes));
  localStorage.setItem(STORAGE.session, JSON.stringify({
    sessionId: state.sessionId,
    startedAt: state.sessionStart,
    combo: state.combo,
    bestCombo: state.sessionBestCombo,
  }));
}

function load() {
  state.profile = safeParse(localStorage.getItem(STORAGE.profile), null);
  state.records = safeParse(localStorage.getItem(STORAGE.board), []);
  state.recentTimes = safeParse(localStorage.getItem(STORAGE.recent), []);
  const session = safeParse(localStorage.getItem(STORAGE.session), null);
  if (session?.sessionId) state.sessionId = session.sessionId;
  if (session?.startedAt) state.sessionStart = session.startedAt;
  if (typeof session?.combo === 'number') state.combo = session.combo;
  if (typeof session?.bestCombo === 'number') state.sessionBestCombo = session.bestCombo;
}

function formatMs(ms) {
  return (typeof ms === 'number' && Number.isFinite(ms)) ? `${Math.round(ms)} ms` : '—';
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hashDate(str) {
  let hash = 0;
  for (const ch of str) hash = (Math.imul(31, hash) + ch.charCodeAt(0)) | 0;
  return hash;
}

function dailyTarget() {
  return 200 + Math.abs(hashDate(todayKey())) % 131;
}

function currentFaction() {
  return FACTIONS[state.profile?.color] || FACTIONS.alpha;
}

function currentTier(ms) {
  if (typeof ms !== 'number') return TIERS[TIERS.length - 1];
  return TIERS.find((tier) => ms < tier.maxMs) || TIERS[TIERS.length - 1];
}

function updateView(view) {
  state.currentView = view;
  const mapping = {
    auth: els.authView,
    play: els.playView,
    board: els.boardView,
    stats: els.statsView,
    dossier: els.dossierView,
    brief: els.briefView,
  };
  Object.entries(mapping).forEach(([name, el]) => {
    if (!el) return;
    el.classList.toggle('hidden', name !== view);
  });
  els.navTabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view || (view === 'play' && btn.dataset.view === 'play')));
  if (els.statusText) {
    const pb = (state.profile?.bestTimeMs ?? '—');
    els.statusText.textContent = `[${formatClock(performance.now() - state.sessionStart)}] · OP_STATUS: ${state.profile ? 'ACTIVE' : 'LOCKED'} · SIGNAL: ${state.phase === 'go' ? 'GREEN' : state.phase === 'waiting' ? 'ARMED' : 'LOCKED'} · OPERATIVES_ONLINE: 4,217 · SESSION_ID: ${state.sessionId} · LAST_PB: ${formatMs(pb)} · BUILD: REFLEX//ZERO v2.6.0 ·`;
  }
}

function setAuthMessage(msg) {
  if (els.authStatus) els.authStatus.textContent = `> ${msg}`;
}

function clearTimer() {
  if (state.waitTimer) {
    clearTimeout(state.waitTimer);
    state.waitTimer = null;
  }
}

function setStagePhase(phase) {
  state.phase = phase;
  els.gameStage?.classList.remove('idle', 'waiting', 'go');
  els.gameStage?.classList.add(phase);
  if (phase === 'idle') {
    els.stageTitle.textContent = 'Stand by. Wait for the GREEN signal.';
    els.stageCopy.textContent = 'Premature input fails the round.';
    els.gameButton.textContent = 'ENGAGE';
    els.gameButton.disabled = false;
    els.tooSlowIndicator.classList.add('hidden');
  }
  if (phase === 'waiting') {
    els.stageTitle.textContent = 'Hold.';
    els.stageCopy.textContent = 'The screen is RED. Stay still.';
    els.gameButton.textContent = 'WAITING...';
  }
  if (phase === 'go') {
    els.stageTitle.textContent = 'FIRE.';
    els.stageCopy.textContent = 'Signal is GREEN. Click now.';
    els.gameButton.textContent = 'CLICK!';
  }
}

function startRound() {
  clearTimer();
  setStagePhase('waiting');
  updateView(state.currentView);
  const config = DIFFICULTIES.find((d) => d.key === state.currentDifficulty) || DIFFICULTIES[0];
  const comboPressure = Math.min(state.combo, 20) / 20;
  const pressureFactor = 1 - comboPressure * 0.4;
  const delay = Math.floor((config.waitMin * pressureFactor) + Math.random() * ((config.waitMax * pressureFactor) - (config.waitMin * pressureFactor)));

  if (els.signalBars) els.signalBars.style.opacity = '1';
  els.gameStage?.classList.add('fake-cue');
  if (Math.random() < (state.combo >= 20 ? 0.4 : state.combo >= 10 ? 0.3 : 0.15)) {
    setTimeout(() => els.gameStage?.classList.add('fake-cue'), Math.max(100, delay * 0.35));
    setTimeout(() => els.gameStage?.classList.remove('fake-cue'), Math.max(160, delay * 0.35 + 120));
  }

  state.waitTimer = setTimeout(() => {
    state.startTime = performance.now();
    setStagePhase('go');
    if (els.gameStage) {
      els.gameStage.style.boxShadow = 'inset 0 0 0 1px rgba(0,255,65,.2), 0 0 60px rgba(0,255,65,.08)';
    }
  }, delay);
}

function endRound(ms, kind = 'success') {
  clearTimer();
  if (kind === 'success') {
    state.combo += 1;
    state.sessionBestCombo = Math.max(state.sessionBestCombo, state.combo);
    state.recentTimes.push(ms);
    state.recentTimes = state.recentTimes.slice(-20);
    const prevBest = state.profile.bestTimeMs ?? null;
    const tierBefore = currentTier(prevBest);
    state.profile.lastTimeMs = ms;
    state.profile.attempts = (state.profile.attempts || 0) + 1;
    state.profile.sumTime = (state.profile.sumTime || 0) + ms;
    state.profile.avgTimeMs = state.profile.sumTime / state.profile.attempts;
    if (prevBest === null || ms < prevBest) {
      state.profile.bestTimeMs = ms;
      const nextTier = currentTier(ms);
      if (tierBefore.name !== nextTier.name) {
        setTimeout(() => showTierPromotion(nextTier), 450);
      }
    }
    state.profile.bestCombo = Math.max(state.profile.bestCombo || 0, state.sessionBestCombo);
    const rank = currentTier(state.profile.bestTimeMs).name;
    state.profile.rank = rank;
    upsertRecord();
    renderEverything();
    setStagePhase('idle');
    updateView(state.currentView);
    els.feedbackZone.classList.remove('hidden');
    els.feedbackMain.textContent = formatMs(ms);
    els.feedbackSub.textContent = `Good hit. ${ms < 600 ? 'Within the 600ms limit.' : 'You were over the limit.'}`;
    els.lastResult.textContent = formatMs(ms);
    els.bestResult.textContent = formatMs(state.profile.bestTimeMs);
  } else {
    state.combo = 0;
    renderEverything();
  }
  save();
}

function upsertRecord() {
  const record = {
    id: state.profile.id,
    nickname: state.profile.nickname,
    color: state.profile.color,
    bestTimeMs: state.profile.bestTimeMs ?? null,
    attempts: state.profile.attempts || 0,
    avgTimeMs: state.profile.avgTimeMs || null,
    updatedAt: Date.now(),
  };
  const others = state.records.filter((item) => item.id !== record.id);
  others.push(record);
  others.sort((a, b) => (a.bestTimeMs ?? Infinity) - (b.bestTimeMs ?? Infinity));
  state.records = others.slice(0, 20);
}

function renderLeaderboard() {
  const list = [...state.records]
    .filter((r) => typeof r.bestTimeMs === 'number')
    .sort((a, b) => a.bestTimeMs - b.bestTimeMs)
    .slice(0, 10);

  const markup = list.length ? list.map((row, index) => {
    const faction = FACTIONS[row.color] || FACTIONS.alpha;
    return `<li><strong>#${String(index + 1).padStart(2, '0')}</strong><span style="color:${faction.color}">${escapeHtml(row.nickname)}</span><span>${formatMs(row.bestTimeMs)}</span></li>`;
  }).join('') : `<li><strong>—</strong><span>Be the first on the board.</span><span>—</span></li>`;

  if (els.boardList) els.boardList.innerHTML = markup;
  if (els.boardViewList) els.boardViewList.innerHTML = markup;
}

function renderStats() {
  const best = state.profile?.bestTimeMs ?? null;
  const avg = state.profile?.avgTimeMs ?? null;
  const last = state.profile?.lastTimeMs ?? null;
  const attempts = state.profile?.attempts || 0;
  const rank = currentTier(best).name;
  const tier = currentTier(best);

  const nodes = [
    els.statsBestTime, els.statsBestTime2,
  ];
  nodes.forEach((n) => n && (n.textContent = formatMs(best)));
  [els.statsAvgTime, els.statsAvgTime2].forEach((n) => n && (n.textContent = formatMs(avg)));
  [els.statsLastTime, els.statsLastTime2].forEach((n) => n && (n.textContent = formatMs(last)));
  [els.statsAttempts, els.statsAttempts2].forEach((n) => n && (n.textContent = String(attempts)));
  [els.statsRank, els.statsRank2].forEach((n) => n && (n.textContent = rank));
  [els.statsTier, els.statsTier2].forEach((n) => n && (n.textContent = tier.name));
  if (els.rankResult) els.rankResult.textContent = rank;
}

function renderDossier() {
  if (!state.profile) return;
  if (els.profileNickname) els.profileNickname.textContent = state.profile.nickname || '—';
  if (els.profileFaction) els.profileFaction.textContent = FACTIONS[state.profile.color]?.label || '—';
  if (els.profileTier) els.profileTier.textContent = currentTier(state.profile.bestTimeMs).name;
  if (els.profileId) els.profileId.textContent = state.profile.id || '—';
  if (els.profileSwatch) {
    els.profileSwatch.style.background = `linear-gradient(180deg, ${FACTIONS[state.profile.color]?.color || '#8ca0b3'} 0%, rgba(255,255,255,.03) 100%)`;
    els.profileSwatch.style.boxShadow = `0 0 22px color-mix(in srgb, ${FACTIONS[state.profile.color]?.color || '#8ca0b3'} 20%, transparent)`;
  }
}

function renderDailyChallenge() {
  const target = dailyTarget();
  const key = todayKey();
  const daily = safeParse(localStorage.getItem(STORAGE.daily), {});
  const done = daily[key] || 0;
  state.currentDaily = { key, target, done };
  if (els.dcTarget) els.dcTarget.textContent = `sub-${target}ms`;
  if (els.dcCompletions) els.dcCompletions.textContent = `${done} player${done === 1 ? '' : 's'} completed today`;
  if (els.dcStatus) {
    const completed = state.profile?.dailyChallengeDate === key;
    els.dcStatus.textContent = completed ? '✓ DONE' : 'ACTIVE';
    els.dcStatus.className = `dc-status ${completed ? 'dc-done' : 'dc-active'}`;
  }
}

function updateSparkline() {
  if (!els.sparklineContainer) return;
  const values = state.recentTimes.filter((n) => typeof n === 'number' && n > 0);
  if (values.length < 2) {
    els.sparklineContainer.textContent = 'Play a few rounds to see your trend.';
    return;
  }
  const w = 1000;
  const h = 72;
  const pad = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + ((max - v) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const best = formatMs(min);
  const last = formatMs(values[values.length - 1]);
  els.sparklineContainer.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke="rgba(0,255,65,.95)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${pts}"></polyline>
    </svg>
    <div>Best ${best} · Last ${last}</div>
  `;
}

function renderEverything() {
  updateSparkline();
  renderLeaderboard();
  renderStats();
  renderDossier();
  renderDailyChallenge();
  if (els.comboValue) els.comboValue.textContent = String(state.combo);
  if (els.threatLevel) els.threatLevel.textContent = state.combo >= 10 ? 'HIGH' : state.combo >= 5 ? 'MED' : 'LOW';
  if (els.staminaLevel) els.staminaLevel.textContent = state.profile?.attempts ? 'VITAL' : 'STANDBY';
  if (els.lastResult) els.lastResult.textContent = formatMs(state.profile?.lastTimeMs ?? null);
  if (els.bestResult) els.bestResult.textContent = formatMs(state.profile?.bestTimeMs ?? null);
  if (els.sessionClock) els.sessionClock.textContent = formatClock(performance.now() - state.sessionStart);
  if (els.difficultySwitch) {
    const current = DIFFICULTIES.find((d) => d.key === state.currentDifficulty);
    els.difficultySwitch.textContent = current?.label || 'EASY';
  }
  updateView(state.currentView);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
}

function showTierPromotion(tier) {
  if (!els.tierPromotion) return;
  els.tierPromotion.classList.remove('hidden');
  els.tierPromotionName.textContent = tier.name;
  els.tierPromotionName.style.color = tier.color;
  els.tierPromotionDesc.textContent = tier.description;
  els.tierPromotionThreshold.textContent = tier.name === 'ZERO' ? 'You have reached the highest tier.' : `Next tier: ${tier.name}`;
}

function hideTierPromotion() {
  els.tierPromotion?.classList.add('hidden');
}

function handleDeploy(event) {
  event.preventDefault();
  const nickname = normalizeNickname(els.nicknameInput.value);
  if (!nickname) {
    setAuthMessage('ENTER A CALLSIGN.');
    return;
  }
  const color = els.nicknameColor.value || 'alpha';
  state.profile = {
    id: state.profile?.id || Math.random().toString(36).slice(2, 10).toUpperCase(),
    nickname,
    color,
    bestTimeMs: state.profile?.bestTimeMs ?? null,
    lastTimeMs: state.profile?.lastTimeMs ?? null,
    avgTimeMs: state.profile?.avgTimeMs ?? null,
    attempts: state.profile?.attempts ?? 0,
    sumTime: state.profile?.sumTime ?? 0,
    bestCombo: state.profile?.bestCombo ?? 0,
    rank: state.profile?.rank ?? 'RECRUIT',
  };
  state.records = Array.isArray(state.records) ? state.records : [];
  state.recentTimes = Array.isArray(state.recentTimes) ? state.recentTimes : [];
  setAuthMessage('OPERATIVE DEPLOYED.');
  updateView('play');
  renderEverything();
  save();
}

function handleGameClick() {
  if (!state.profile) return;
  if (state.phase === 'idle') {
    startRound();
    return;
  }
  if (state.phase === 'waiting') {
    state.combo = 0;
    setStagePhase('idle');
    setAuthMessage('SYSTEM FAULT. TOO EARLY.');
    return;
  }
  if (state.phase === 'go') {
    const ms = performance.now() - state.startTime;
    if (ms > 600) {
      state.combo = 0;
      clearTimer();
      setStagePhase('idle');
      els.feedbackZone.classList.remove('hidden');
      els.feedbackMain.textContent = ms < 700 ? 'SO CLOSE' : 'TOO SLOW';
      els.feedbackSub.textContent = `${Math.round(ms)} ms. The limit is 600 ms.`;
      setAuthMessage('SIGNAL MISSED.');
      renderEverything();
      save();
      return;
    }
    els.feedbackZone.classList.remove('hidden');
    els.feedbackMain.textContent = formatMs(ms);
    els.feedbackSub.textContent = ms < 100 ? 'Apex-class response.' : ms < 180 ? 'Elite response.' : ms < 250 ? 'Strong hit.' : 'Keep pushing.';
    endRound(ms, 'success');
    state.profile.dailyChallengeDate = state.currentDaily?.key && ms < state.currentDaily.target ? state.currentDaily.key : state.profile.dailyChallengeDate;
    if (state.currentDaily && ms < state.currentDaily.target) {
      const daily = safeParse(localStorage.getItem(STORAGE.daily), {});
      daily[state.currentDaily.key] = (daily[state.currentDaily.key] || 0) + 1;
      localStorage.setItem(STORAGE.daily, JSON.stringify(daily));
    }
    return;
  }
}

function cycleDifficulty() {
  const index = DIFFICULTIES.findIndex((d) => d.key === state.currentDifficulty);
  const next = DIFFICULTIES[(index + 1) % DIFFICULTIES.length];
  state.currentDifficulty = next.key;
  renderEverything();
}

function resetStats() {
  if (!state.profile) return;
  const ok = confirm('Are you sure you want to purge telemetry?');
  if (!ok) return;
  state.profile.bestTimeMs = null;
  state.profile.lastTimeMs = null;
  state.profile.avgTimeMs = null;
  state.profile.attempts = 0;
  state.profile.sumTime = 0;
  state.profile.rank = 'RECRUIT';
  state.combo = 0;
  state.sessionBestCombo = 0;
  state.recentTimes = [];
  state.records = state.records.filter((r) => r.id !== state.profile.id);
  save();
  renderEverything();
  setStagePhase('idle');
}

function bindEvents() {
  els.navBrandClick?.addEventListener('click', () => updateView('play'));
  els.navTabs.forEach((btn) => btn.addEventListener('click', () => updateView(btn.dataset.view)));
  els.nicknameForm?.addEventListener('submit', handleDeploy);
  els.colorBtns.forEach((btn) => btn.addEventListener('click', () => {
    els.colorBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    els.nicknameColor.value = btn.dataset.color;
  }));
  els.gameButton?.addEventListener('click', handleGameClick);
  els.gameStage?.addEventListener('click', (e) => {
    if (e.target === els.gameButton) return;
    handleGameClick();
  });
  els.gameStage?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleGameClick();
    }
  });
  els.feedbackAgainBtn?.addEventListener('click', () => { setStagePhase('idle'); startRound(); });
  els.difficultySwitch?.addEventListener('click', cycleDifficulty);
  els.resetStatsBtn?.addEventListener('click', resetStats);
  els.resetStatsBtn2?.addEventListener('click', resetStats);
  els.tierPromotionClose?.addEventListener('click', hideTierPromotion);
  els.tierPromotionContinue?.addEventListener('click', hideTierPromotion);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTierPromotion();
  });
  window.addEventListener('beforeunload', save);
}

function boot() {
  load();
  bindEvents();

  if (!state.profile) {
    state.profile = {
      id: Math.random().toString(36).slice(2, 10).toUpperCase(),
      nickname: '',
      color: 'alpha',
      bestTimeMs: null,
      lastTimeMs: null,
      avgTimeMs: null,
      attempts: 0,
      sumTime: 0,
      bestCombo: 0,
      rank: 'RECRUIT',
      dailyChallengeDate: null,
    };
  }

  if (state.profile.nickname) {
    updateView('play');
  } else {
    updateView('auth');
    setAuthMessage('AWAITING INPUT.');
  }

  if (els.nicknameInput && state.profile.nickname) els.nicknameInput.value = state.profile.nickname;
  if (els.nicknameColor) els.nicknameColor.value = state.profile.color || 'alpha';
  els.colorBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.color === (state.profile.color || 'alpha')));

  setStagePhase('idle');
  renderEverything();
  save();

  setInterval(() => {
    if (els.sessionClock) els.sessionClock.textContent = formatClock(performance.now() - state.sessionStart);
    updateView(state.currentView);
  }, 1000);

  if (state.profile.nickname) {
    setAuthMessage('OPERATIVE READY.');
  }
}

boot();
