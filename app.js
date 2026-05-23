
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInAnonymously,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  where,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

await setPersistence(auth, browserLocalPersistence);

const $ = (id) => document.getElementById(id);

const topNav = $('topNav');
const authView = $('authView');
const playView = $('playView');
const leaderboardView = $('leaderboardView');
const statsView = $('statsView');
const profileView = $('profileView');
const aboutView = $('aboutView');

const authStatus = $('authStatus');
const nicknameForm = $('nicknameForm');
const nicknameInput = $('nicknameInput');
const nicknameColor = $('nicknameColor');

const navTabs = [...document.querySelectorAll('.nav-tab')];
const navProfilePill = $('navProfilePill');

const gameStage = $('gameStage');
const gameButton = $('gameButton');
const stageCopy = $('stageCopy');
const feedbackZone = $('feedbackZone');
const feedbackMain = $('feedbackMain');
const feedbackSub = $('feedbackSub');
const feedbackAgainBtn = $('feedbackAgainBtn');
const lastResult = $('lastResult');
const bestResult = $('bestResult');
const tooSlowIndicator = $('tooSlowIndicator');

const leaderNickFull = $('leaderNickFull');
const leaderTimeFull = $('leaderTimeFull');
const leaderboardListFull = $('leaderboardListFull');

const statsBestTime = $('statsBestTime');
const statsAvgTime = $('statsAvgTime');
const statsWorstTime = $('statsWorstTime');
const statsAttempts = $('statsAttempts');
const statsRank = $('statsRank');
const statsSuccess = $('statsSuccess');

const profileNickname = $('profileNickname');
const profileNicknameColorPreview = $('profileNicknameColorPreview');

let currentUser = null;
let profile = null;
let leaderboard = [];
let currentView = 'auth';
let leaderboardUnsub = null;
let waitTimer = null;
let startTime = 0;
let phase = 'idle';
let currentDifficulty = 'easy';
let comboCount = 0;
let sessionHighestCombo = 0;
let dailyChallenge = null;
let recentTimes = [];

let waitingSound = null;
let greenClickSound = null;
let failSound = null;

function setStatus(message) {
  if (authStatus) authStatus.textContent = message;
}

function escapeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
}

function formatMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  return `${Math.round(ms)} ms`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

function clearWaitTimer() {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}

function createSound(src, { loop = false, volume = 1 } = {}) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.loop = loop;
  audio.volume = volume;
  return audio;
}

function stopSound(audio) {
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch (error) {
    console.warn('Unable to stop sound:', error);
  }
}

function playSound(audio) {
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }
  } catch (error) {
    console.warn('Unable to play sound:', error);
  }
}

function stopAllGameSounds() {
  stopSound(waitingSound);
  stopSound(greenClickSound);
  stopSound(failSound);
}

function ensureGameSounds() {
  waitingSound = waitingSound || createSound('waiting.mp3', { loop: true, volume: 0.75 });
  greenClickSound = greenClickSound || createSound('green-click.mp3', { volume: 0.85 });
  failSound = failSound || createSound('fail.mp3', { volume: 0.85 });
}

function triggerFailFlash() {
  const flash = document.getElementById('failFlash');
  if (!flash) return;
  flash.classList.remove('active');
  void flash.offsetWidth;
  flash.classList.add('active');
  setTimeout(() => flash.classList.remove('active'), 600);
}

function triggerPBCeremony() {
  const flash = document.getElementById('pbFlash');
  if (flash) {
    flash.classList.remove('active');
    void flash.offsetWidth;
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 1000);
  }
  if (feedbackMain) {
    feedbackMain.classList.add('pb-glow');
    setTimeout(() => feedbackMain.classList.remove('pb-glow'), 1200);
  }
}

function startFakeCue() {
  if (!gameStage || phase !== 'waiting') return;
  gameStage.classList.add('fake-cue');
  setTimeout(() => gameStage.classList.remove('fake-cue'), 130);
}

const TOO_SOON_MESSAGES = [
  'JUMPED THE GUN',
  'TOO EAGER',
  'NOT YET!',
  'PATIENCE!',
  'WAIT FOR GREEN',
];

function getTooLateMessage(timeMs) {
  if (timeMs < 700) return { main: 'SO CLOSE', sub: `${Math.round(timeMs)}ms — only ${Math.round(timeMs - 600)}ms over. You were right there.` };
  if (timeMs < 900) return { main: 'TOO SLOW', sub: `${Math.round(timeMs)}ms. The limit is 600ms. Close though.` };
  if (timeMs < 1200) return { main: 'WAY TOO SLOW', sub: `${Math.round(timeMs)}ms? You can do better.` };
  if (timeMs < 1800) return { main: 'ARE YOU ASLEEP?', sub: `${Math.round(timeMs)}ms. The limit is 600ms. Wake up.` };
  return { main: 'HELLO?? 👋', sub: `${Math.round(timeMs)}ms. Anyone home?` };
}

const TIERS = [
  { name: 'RASH ELITE ◆',    maxMs: 150,      color: '#ff00ff', glow: 'rgba(255,0,255,0.8)',    description: 'You are in the top 1% of all players.' },
  { name: 'DIAMOND REFLEX',  maxMs: 200,      color: '#b9f2ff', glow: 'rgba(0,255,247,0.7)',    description: 'Elite reaction speed. Genuinely fast.' },
  { name: 'PLATINUM STRIKE', maxMs: 250,      color: '#e5e4e2', glow: 'rgba(229,228,226,0.6)',  description: 'Among the fastest on the board.' },
  { name: 'GOLD FLASH',      maxMs: 350,      color: '#FFD700', glow: 'rgba(255,215,0,0.7)',    description: 'Sharp and consistent. Above average.' },
  { name: 'SILVER SNAP',     maxMs: 500,      color: '#C0C0C0', glow: 'rgba(192,192,192,0.5)',  description: 'Above average reflexes. Keep pushing.' },
  { name: 'COPPER NERVE',    maxMs: 700,      color: '#cd7f32', glow: 'rgba(205,127,50,0.5)',   description: 'Getting there. Keep clicking.' },
  { name: 'IRON REFLEX',     maxMs: Infinity, color: '#708090', glow: 'rgba(112,128,144,0.4)',  description: 'Everyone starts somewhere.' },
];

function getTier(bestTimeMs) {
  if (typeof bestTimeMs !== 'number') return null;
  return TIERS.find(t => bestTimeMs < t.maxMs) || TIERS[TIERS.length - 1];
}

function applyTierToElement(el, tier) {
  if (!el) return;
  if (!tier) { el.textContent = '—'; el.style.color = ''; el.style.textShadow = ''; return; }
  el.textContent = tier.name;
  el.style.color = tier.color;
  el.style.textShadow = `0 0 15px ${tier.glow}`;
}

let tierPromotionTimer = null;

function dismissTierPromotion() {
  const overlay = document.getElementById('tierPromotion');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => overlay.classList.add('hidden'), 380);
}

function triggerTierPromotion(tier) {
  const overlay = document.getElementById('tierPromotion');
  const nameEl = document.getElementById('tierPromotionName');
  const descEl = document.getElementById('tierPromotionDesc');
  const threshEl = document.getElementById('tierPromotionThreshold');
  if (!overlay || !nameEl || !descEl) return;

  nameEl.textContent = tier.name;
  nameEl.style.color = tier.color;
  nameEl.style.textShadow = `0 0 30px ${tier.glow}, 0 0 60px ${tier.glow}`;
  descEl.textContent = tier.description;

  const nextTierIndex = TIERS.indexOf(tier) - 1;
  if (threshEl) {
    if (nextTierIndex >= 0) {
      threshEl.textContent = `Next tier: ${TIERS[nextTierIndex].name} (sub-${TIERS[nextTierIndex].maxMs}ms)`;
    } else {
      threshEl.textContent = 'You have reached the highest tier.';
    }
  }

  overlay.classList.remove('hidden');
  void overlay.offsetWidth;
  overlay.classList.add('active');

  clearTimeout(tierPromotionTimer);
  tierPromotionTimer = setTimeout(() => dismissTierPromotion(), 5000);
}

function checkAndTriggerTierPromotion(oldBestMs, newBestMs) {
  const oldTier = getTier(oldBestMs);
  const newTier = getTier(newBestMs);
  if (!oldTier || !newTier) return;
  if (oldTier.name !== newTier.name) {
    setTimeout(() => triggerTierPromotion(newTier), 900);
  }
}

function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDailyChallengeTarget(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (Math.imul(31, hash) + dateStr.charCodeAt(i)) | 0;
  }
  return 200 + Math.abs(hash) % 131;
}

async function loadDailyChallenge() {
  const dateStr = getTodayDateStr();
  const target = getDailyChallengeTarget(dateStr);
  try {
    const ref = doc(db, 'dailyChallenges', dateStr);
    const snap = await getDoc(ref);
    const completionCount = snap.exists() ? (snap.data().completionCount || 0) : 0;
    dailyChallenge = { target, completionCount, dateStr };
  } catch (e) {
    dailyChallenge = { target, completionCount: 0, dateStr };
  }
  renderDailyChallengeCard();
}

function renderDailyChallengeCard() {
  const card = document.getElementById('dailyChallengeCard');
  if (!card || !dailyChallenge) return;

  const alreadyCompleted = profile?.dailyChallengeDate === dailyChallenge.dateStr;
  const targetEl = document.getElementById('dcTarget');
  const completionsEl = document.getElementById('dcCompletions');
  const statusEl = document.getElementById('dcStatus');

  if (targetEl) targetEl.textContent = `sub-${dailyChallenge.target}ms`;
  if (completionsEl) {
    const n = dailyChallenge.completionCount;
    completionsEl.textContent = `${n} player${n !== 1 ? 's' : ''} completed today`;
  }
  if (statusEl) {
    statusEl.textContent = alreadyCompleted ? '✓ DONE' : 'ACTIVE';
    statusEl.className = `dc-status ${alreadyCompleted ? 'dc-done' : 'dc-active'}`;
  }

  card.classList.remove('hidden');
}

function showDCToast() {
  const toast = document.getElementById('dcToast');
  if (!toast) return;
  toast.classList.remove('hidden', 'dc-toast-out');
  void toast.offsetWidth;
  toast.classList.add('dc-toast-in');
  setTimeout(() => {
    toast.classList.remove('dc-toast-in');
    toast.classList.add('dc-toast-out');
    setTimeout(() => toast.classList.add('hidden'), 420);
  }, 3500);
}

async function checkDailyChallengeCompletion(timeMs) {
  if (!dailyChallenge || !currentUser || !profile?.nickname) return;
  if (profile.dailyChallengeDate === dailyChallenge.dateStr) return;
  if (timeMs >= dailyChallenge.target) return;

  try {
    const ref = doc(db, 'dailyChallenges', dailyChallenge.dateStr);
    await setDoc(ref, {
      completionCount: increment(1),
      target: dailyChallenge.target,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await persistProfilePatch({ dailyChallengeDate: dailyChallenge.dateStr });

    const lbRef = doc(db, 'leaderboard', currentUser.uid);
    await setDoc(lbRef, { dailyChallengeDate: dailyChallenge.dateStr }, { merge: true });

    dailyChallenge.completionCount++;
    renderDailyChallengeCard();
    showDCToast();
  } catch (e) {
    console.error('Daily challenge update failed:', e);
  }
}

function setStageState(state) {
  if (!gameStage) return;
  gameStage.classList.remove('idle', 'waiting', 'go');
  gameStage.classList.add(state);
}

function loadRecentTimes() {
  if (!currentUser) return;
  try {
    const raw = localStorage.getItem(`rashreflex_recent_${currentUser.uid}`);
    recentTimes = raw ? JSON.parse(raw).slice(-20) : [];
  } catch { recentTimes = []; }
  renderSparkline();
}

function pushRecentTime(timeMs) {
  if (!currentUser) return;
  recentTimes.push(timeMs);
  if (recentTimes.length > 20) recentTimes = recentTimes.slice(-20);
  try {
    localStorage.setItem(`rashreflex_recent_${currentUser.uid}`, JSON.stringify(recentTimes));
  } catch {}
  renderSparkline();
}

function renderSparkline() {
  const container = document.getElementById('sparklineContainer');
  if (!container) return;

  const times = recentTimes.filter(t => typeof t === 'number' && t > 0);
  if (times.length < 2) {
    container.innerHTML = '<p class="sparkline-empty">Play a few rounds to see your trend.</p>';
    return;
  }

  const W = 300, H = 72, PAD = 10;
  const minV = Math.min(...times);
  const maxV = Math.max(...times);
  const range = maxV - minV || 1;

  const pts = times.map((t, i) => {
    const x = PAD + (i / (times.length - 1)) * (W - PAD * 2);
    const y = PAD + ((maxV - t) / range) * (H - PAD * 2);
    return [x, y];
  });

  const n = times.length;
  const half = Math.max(1, Math.floor(n / 2));
  const avgFirst = times.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const avgLast = times.slice(half).reduce((a, b) => a + b, 0) / Math.max(1, n - half);
  const improving = avgLast < avgFirst;
  const lineColor = improving ? '#00ff41' : '#ff6b6b';
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const last = pts[pts.length - 1];

  container.innerHTML = `
    <svg width="100%" viewBox="0 0 ${W} ${H}" class="sparkline-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polyline points="${polyline} ${W - PAD},${H} ${PAD},${H}" fill="url(#sparkGrad)" stroke="none"/>
      <polyline points="${polyline}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === pts.length - 1 ? '4' : '2'}" fill="${lineColor}" opacity="${i === pts.length - 1 ? '1' : '0.35'}"/>`).join('')}
      <circle cx="${last[0]}" cy="${last[1]}" r="7" fill="none" stroke="${lineColor}" stroke-width="1.5" opacity="0.45"/>
    </svg>
    <div class="sparkline-footer">
      <span class="sparkline-stat"><span class="sparkline-stat-label">Best</span>${formatMs(Math.min(...times))}</span>
      <span class="sparkline-trend" style="color:${lineColor}">${improving ? '↓ Improving' : '↑ Slower'}</span>
      <span class="sparkline-stat"><span class="sparkline-stat-label">Last</span>${formatMs(times[times.length - 1])}</span>
    </div>
  `;
}

function getDifficultyConfig(difficulty) {
  const configs = {
    easy: { waitMin: 800, waitMax: 1500, name: 'EASY', color: '#00ff41' },
    medium: { waitMin: 500, waitMax: 1200, name: 'MEDIUM', color: '#ffa500' },
    hard: { waitMin: 300, waitMax: 1000, name: 'HARD', color: '#ff3333' }
  };
  return configs[difficulty] || configs.easy;
}

function updateComboDisplay() {
  const comboElement = document.getElementById('comboValue');
  const comboDisplay = document.getElementById('comboDisplay');
  if (!comboElement || !comboDisplay) return;

  comboElement.textContent = comboCount;
  comboDisplay.classList.remove('combo-break', 'milestone', 'tier-5', 'tier-10', 'tier-20');

  if (comboCount >= 20) {
    comboDisplay.classList.add('tier-20');
  } else if (comboCount >= 10) {
    comboDisplay.classList.add('tier-10');
  } else if (comboCount >= 5) {
    comboDisplay.classList.add('tier-5');
  }

  if (comboCount > 0 && comboCount % 5 === 0) {
    comboDisplay.classList.add('milestone');
  }

  if (gameStage) {
    gameStage.classList.remove('combo-tier-5', 'combo-tier-10', 'combo-tier-20');
    if (comboCount >= 20) gameStage.classList.add('combo-tier-20');
    else if (comboCount >= 10) gameStage.classList.add('combo-tier-10');
    else if (comboCount >= 5) gameStage.classList.add('combo-tier-5');
  }
}

function breakCombo() {
  const previousCombo = comboCount;
  if (previousCombo > 0) {
    const comboDisplay = document.getElementById('comboDisplay');
    if (comboDisplay) {
      comboDisplay.classList.add('combo-break');
      setTimeout(() => comboDisplay.classList.remove('combo-break'), 400);
    }
    if (previousCombo >= 10 && gameStage) {
      gameStage.classList.add('combo-shatter');
      setTimeout(() => gameStage.classList.remove('combo-shatter'), 500);
    }
  }
  comboCount = 0;
  updateComboDisplay();
}

function showView(view) {
  if (authView) authView.classList.toggle('hidden', view !== 'auth');
  if (playView) playView.classList.toggle('hidden', view !== 'play');
  if (leaderboardView) leaderboardView.classList.toggle('hidden', view !== 'leaderboard');
  if (statsView) statsView.classList.toggle('hidden', view !== 'stats');
  if (profileView) profileView.classList.toggle('hidden', view !== 'profile');
  if (aboutView) aboutView.classList.toggle('hidden', view !== 'about');
  if (topNav) topNav.classList.toggle('hidden', view === 'auth');

  currentView = view;

  navTabs.forEach((btn) => btn.classList.remove('active'));
  const activeTab = document.querySelector(`[data-view="${view}"]`);
  if (activeTab) activeTab.classList.add('active');
}

function resetGameStage() {
  clearWaitTimer();
  stopAllGameSounds();
  const _rpf = document.getElementById('pressureFill');
  if (_rpf) { _rpf.style.transition = 'none'; _rpf.style.width = '0%'; }
  phase = 'idle';
  setStageState('idle');

  if (feedbackZone) {
    feedbackZone.classList.add('hidden');
    feedbackZone.classList.remove('record-break', 'too-soon');
  }

  if (stageCopy) {
    stageCopy.innerHTML = `
      <h3>Click to get started</h3>
      <p>Wait for the screen to turn green. Click too early and you will have to restart.</p>
    `;
  }

  if (gameButton) {
    gameButton.textContent = 'Click to get started';
    gameButton.disabled = false;
    gameButton.classList.remove('hidden');
  }
}

async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const fresh = {
      uid: user.uid,
      email: user.email || '',
      provider: user.providerData?.[0]?.providerId || 'anonymous',
      nickname: '',
      bestTimeMs: null,
      lastTimeMs: null,
      attempts: 0,
      failedAttempts: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, fresh);
    return fresh;
  }

  return snap.data();
}

async function persistProfilePatch(patch) {
  if (!currentUser) return;

  const ref = doc(db, 'users', currentUser.uid);
  const nextProfile = {
    ...(profile || {}),
    ...patch,
    uid: currentUser.uid,
    email: currentUser.email || profile?.email || '',
    updatedAt: serverTimestamp()
  };

  await setDoc(ref, nextProfile, { merge: true });
  profile = { ...(profile || {}), ...patch };
  return profile;
}

async function syncLeaderboardDoc(timeMs, kind = 'score') {
  if (!currentUser || !profile?.nickname) return;

  const ref = doc(db, 'leaderboard', currentUser.uid);

  if (kind === 'nickname') {
    if (typeof profile.bestTimeMs !== 'number') return;

    await setDoc(
      ref,
      {
        uid: currentUser.uid,
        nickname: profile.nickname,
        nicknameColor: profile.nicknameColor || '#E8B923',
        bestTimeMs: profile.bestTimeMs,
        lastTimeMs: profile.lastTimeMs ?? profile.bestTimeMs,
        averageTimeMs: profile.averageTimeMs || profile.bestTimeMs,
        attempts: profile.attempts ?? 0,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    return;
  }

  const prevBest = typeof profile.bestTimeMs === 'number' ? profile.bestTimeMs : null;
  const newBest = prevBest === null ? timeMs : Math.min(prevBest, timeMs);
  const attempts = (profile.attempts ?? 0) + 1;
  const prevAvg = typeof profile.averageTimeMs === 'number' ? profile.averageTimeMs : null;
  const newAvg = prevAvg === null ? timeMs : (prevAvg * (attempts - 1) + timeMs) / attempts;

  await setDoc(
    ref,
    {
      uid: currentUser.uid,
      nickname: profile.nickname,
      nicknameColor: profile.nicknameColor || '#E8B923',
      bestTimeMs: newBest,
      lastTimeMs: timeMs,
      averageTimeMs: newAvg,
      attempts,
      updatedAt: serverTimestamp(),
      createdAt: profile.createdAt || serverTimestamp()
    },
    { merge: true }
  );

  profile.bestTimeMs = newBest;
  profile.lastTimeMs = timeMs;
  profile.averageTimeMs = newAvg;
  profile.attempts = attempts;
}

async function saveNickname(rawNickname, rawColor) {
  const nickname = escapeNickname(rawNickname);
  if (!nickname) throw new Error('Nickname cannot be empty.');

  const nicknameColor = rawColor || '#E8B923';
  await persistProfilePatch({ nickname, nicknameColor });

  if (typeof profile?.bestTimeMs === 'number') {
    await syncLeaderboardDoc(profile.bestTimeMs, 'nickname');
  }
}

function renderLeaderboard(rows) {
  const safeRows = rows.filter((row) => typeof row.bestTimeMs === 'number' && row.bestTimeMs > 0);
  leaderboard = safeRows;

  if (leaderboardListFull) leaderboardListFull.innerHTML = '';

  if (!safeRows.length) {
    if (leaderNickFull) leaderNickFull.textContent = 'No scores yet';
    if (leaderTimeFull) leaderTimeFull.textContent = '—';
    const empty = '<li style="justify-content:center;color:var(--muted);">Be the first on the board.</li>';
    if (leaderboardListFull) leaderboardListFull.innerHTML = empty;
    return;
  }

  const first = safeRows[0];
  if (leaderNickFull) leaderNickFull.textContent = first.nickname || 'Anonymous';
  if (leaderNickFull && first.nicknameColor) leaderNickFull.style.color = first.nicknameColor;
  if (leaderTimeFull) leaderTimeFull.textContent = formatMs(first.bestTimeMs);

  safeRows.forEach((row, index) => {
    const li = document.createElement('li');
    const nickColor = row.nicknameColor || '#e8edf5';
    const avgTime = row.averageTimeMs || row.bestTimeMs;
    const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
    const rankDisplay = index < 3 ? `#${index + 1}` : `${index + 1}`;
    li.innerHTML = `
      <div class="lb-left">
        <div class="rank ${rankClass}">${rankDisplay}</div>
        <div class="nick" style="color:${nickColor};">${row.nickname || 'Anonymous'}${row.dailyChallengeDate === getTodayDateStr() ? ' <span class="lb-daily-badge" title="Completed today\'s challenge">⚡</span>' : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div class="time"><span style="color:var(--muted);font-size:0.8rem;">Best: </span>${formatMs(row.bestTimeMs)}</div>
        <div class="time"><span style="color:var(--muted);font-size:0.8rem;">Avg: </span>${formatMs(avgTime)}</div>
      </div>
    `;
    if (leaderboardListFull) leaderboardListFull.appendChild(li);
  });
}

function renderLeaderboardFullFromMemory() {
  if (!leaderboardListFull) return;

  leaderboardListFull.innerHTML = '';
  if (!leaderboard.length) {
    leaderboardListFull.innerHTML = '<li style="justify-content:center;color:var(--muted);">Be the first on the board.</li>';
    return;
  }

  leaderboard.forEach((row, index) => {
    const li = document.createElement('li');
    const nickColor = row.nicknameColor || '#e8edf5';
    const avgTime = row.averageTimeMs || row.bestTimeMs;
    const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
    const rankDisplay = index < 3 ? `#${index + 1}` : `${index + 1}`;
    li.innerHTML = `
      <div class="lb-left">
        <div class="rank ${rankClass}">${rankDisplay}</div>
        <div class="nick" style="color:${nickColor};">${row.nickname || 'Anonymous'}${row.dailyChallengeDate === getTodayDateStr() ? ' <span class="lb-daily-badge" title="Completed today\'s challenge">⚡</span>' : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div class="time"><span style="color:var(--muted);font-size:0.8rem;">Best: </span>${formatMs(row.bestTimeMs)}</div>
        <div class="time"><span style="color:var(--muted);font-size:0.8rem;">Avg: </span>${formatMs(avgTime)}</div>
      </div>
    `;
    leaderboardListFull.appendChild(li);
  });
}

function listenLeaderboard() {
  if (leaderboardUnsub) leaderboardUnsub();

  const leaderboardQuery = query(
    collection(db, 'leaderboard'),
    orderBy('bestTimeMs', 'asc'),
    limit(10)
  );

  leaderboardUnsub = onSnapshot(
    leaderboardQuery,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderLeaderboard(rows);
      if (currentView === 'stats') updateStats().catch(() => {});
    },
    (error) => {
      console.error(error);
      if (leaderNick) leaderNick.textContent = 'Unavailable';
      if (leaderTime) leaderTime.textContent = '—';
      if (leaderboardList) leaderboardList.innerHTML = '<li style="justify-content:center;color:var(--muted);">Leaderboard unavailable right now.</li>';
      if (leaderboardListFull) leaderboardListFull.innerHTML = '<li style="justify-content:center;color:var(--muted);">Leaderboard unavailable right now.</li>';
    }
  );
}

async function updateStats() {
  if (!currentUser || !profile) return;

  const ref = doc(db, 'leaderboard', currentUser.uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;

  const bestTime = data?.bestTimeMs ?? profile.bestTimeMs ?? null;
  const lastTime = data?.lastTimeMs ?? profile.lastTimeMs ?? null;
  const attempts = data?.attempts ?? profile.attempts ?? 0;
  const failedAttempts = profile.failedAttempts ?? 0;

  if (statsBestTime) statsBestTime.textContent = formatMs(bestTime);
  if (statsWorstTime) statsWorstTime.textContent = formatMs(lastTime);
  if (statsAttempts) statsAttempts.textContent = String(attempts);

  applyTierToElement(document.getElementById('statsTier'), getTier(bestTime));

  if (typeof bestTime === 'number' && leaderboard.length) {
    const rank = leaderboard.findIndex((row) => row.id === currentUser.uid) + 1;
    if (statsRank) statsRank.textContent = rank > 0 ? `#${rank} of ${leaderboard.length}` : '—';
  } else if (statsRank) {
    statsRank.textContent = '—';
  }

  if (typeof bestTime === 'number' && typeof lastTime === 'number') {
    if (statsAvgTime) statsAvgTime.textContent = formatMs((bestTime + lastTime) / 2);
  } else if (typeof bestTime === 'number') {
    if (statsAvgTime) statsAvgTime.textContent = formatMs(bestTime);
  } else if (statsAvgTime) {
    statsAvgTime.textContent = '—';
  }
}

async function updateProfileView() {
  if (!currentUser || !profile) return;

  if (profileNickname) profileNickname.textContent = profile.nickname || '—';
  if (profileNickname && profile.nicknameColor) profileNickname.style.color = profile.nicknameColor;
  if (profileNicknameColorPreview) profileNicknameColorPreview.style.backgroundColor = profile.nicknameColor || '#E8B923';

  applyTierToElement(document.getElementById('profileTier'), getTier(profile.bestTimeMs ?? null));

  if (navProfilePill) {
    navProfilePill.textContent = profile.nickname || currentUser.email || '—';
  }

  if (lastResult) lastResult.textContent = formatMs(profile.lastTimeMs ?? null);
  if (bestResult) bestResult.textContent = formatMs(profile.bestTimeMs ?? null);

  if (profile.nickname && typeof profile.bestTimeMs === 'number') {
    syncLeaderboardDoc(profile.bestTimeMs, 'nickname').catch(console.error);
  }
}

function getFeedbackMessage(timeMs) {
  if (timeMs < 100) return { main: '🐐 GOAT LEVEL' };
  if (timeMs < 200) return { main: '⚡ INSANE' };
  if (timeMs < 300) return { main: '✓ GOOD' };
  if (timeMs > 700) return { main: '🐢 SLOW' };
  return { main: '✓ NOT BAD' };
}

function getRecordMessage(timeMs, bestTime) {
  if (bestTime === null || bestTime === undefined) return 'First attempt saved to your account.';
  if (timeMs < bestTime) {
    const improvement = Math.round(bestTime - timeMs);
    return `New personal best by ${improvement} ms.`;
  }
  const distance = Math.round(timeMs - bestTime);
  if (distance < 10) return `So close. Only ${distance} ms away from your record.`;
  if (distance < 50) return `${distance} ms away from your best time.`;
  return `Your best remains ${formatMs(bestTime)}.`;
}

async function saveResult(timeMs) {
  if (!currentUser || !profile?.nickname) return;

  const prevBest = typeof profile.bestTimeMs === 'number' ? profile.bestTimeMs : null;
  const bestTimeMs = prevBest === null ? timeMs : Math.min(prevBest, timeMs);
  const attempts = (profile.attempts ?? 0) + 1;

  profile.bestTimeMs = bestTimeMs;
  profile.lastTimeMs = timeMs;
  profile.attempts = attempts;

  await persistProfilePatch({
    bestTimeMs,
    lastTimeMs: timeMs,
    attempts
  });

  await syncLeaderboardDoc(timeMs, 'score');

  if (lastResult) lastResult.textContent = formatMs(timeMs);
  if (bestResult) bestResult.textContent = formatMs(bestTimeMs);
}

function startRound() {
  if (!currentUser || !profile?.nickname) return;

  clearWaitTimer();
  phase = 'waiting';

  if (feedbackZone) {
    feedbackZone.classList.add('hidden');
    feedbackZone.classList.remove('record-break');
  }

  setStageState('waiting');

  if (stageCopy) {
    stageCopy.innerHTML = `
      <h3>Red screen</h3>
      <p>Stay calm. Wait for green.</p>
    `;
  }

  if (gameButton) {
    gameButton.textContent = 'Waiting...';
    gameButton.disabled = false;
    gameButton.classList.remove('hidden');
  }

  // Wait time scales down as combo grows (up to 45% faster at combo 20)
  const config = getDifficultyConfig(currentDifficulty);
  const comboPressure = Math.min(comboCount, 20) / 20;
  const pressureFactor = 1 - comboPressure * 0.45;
  const scaledMin = Math.floor(config.waitMin * pressureFactor);
  const scaledMax = Math.floor(config.waitMax * pressureFactor);
  const delay = Math.floor(scaledMin + Math.random() * (scaledMax - scaledMin));

  // Pressure fill bar — animates from 0→100% over the wait duration
  const pressureFill = document.getElementById('pressureFill');
  if (pressureFill) {
    pressureFill.style.transition = 'none';
    pressureFill.style.width = '0%';
    void pressureFill.offsetWidth;
    pressureFill.style.transition = `width ${delay}ms linear`;
    pressureFill.style.width = '100%';
  }

  waitTimer = window.setTimeout(() => {
    phase = 'go';
    startTime = performance.now();
    setStageState('go');

    // Clear pressure bar on green
    const pf = document.getElementById('pressureFill');
    if (pf) { pf.style.transition = 'none'; pf.style.width = '0%'; }

    if (stageCopy) {
      stageCopy.innerHTML = `
        <h3>Green screen</h3>
        <p>Click now.</p>
      `;
    }

    if (gameButton) {
      gameButton.textContent = 'Click!';
    }
  }, delay);

  // Fake cue probability escalates with combo (15% → 40%)
  const fakeCueChance = comboCount >= 20 ? 0.40 : comboCount >= 10 ? 0.30 : comboCount >= 5 ? 0.22 : 0.15;
  if (Math.random() < fakeCueChance) {
    const fakeAt = Math.floor(delay * (0.35 + Math.random() * 0.3));
    setTimeout(() => startFakeCue(), fakeAt);
  }
}

async function finishRound(timeMs) {
  clearWaitTimer();
  stopAllGameSounds();
  phase = 'result';
  setStageState('idle');

  const prevBestMs = typeof profile?.bestTimeMs === 'number' ? profile.bestTimeMs : null;
  const isPB = prevBestMs !== null && timeMs < prevBestMs;

  comboCount++;
  if (comboCount > sessionHighestCombo) {
    sessionHighestCombo = comboCount;
  }
  updateComboDisplay();

  const feedback = getFeedbackMessage(timeMs);
  const recordText = getRecordMessage(timeMs, profile?.bestTimeMs ?? null);

  if (feedbackZone) {
    feedbackZone.classList.remove('hidden');
    feedbackZone.classList.toggle('record-break', isPB);
  }

  if (feedbackMain) feedbackMain.textContent = formatMs(timeMs);
  if (feedbackSub) feedbackSub.textContent = `${feedback.main}. ${recordText}`;
  if (stageCopy) stageCopy.innerHTML = '';
  if (gameButton) gameButton.classList.add('hidden');

  playSound(greenClickSound);

  if (isPB) {
    triggerPBCeremony();
    checkAndTriggerTierPromotion(prevBestMs, timeMs);
  }

  try {
    await saveResult(timeMs);
    updateStats().catch(() => {});
    checkDailyChallengeCompletion(timeMs).catch(() => {});
    pushRecentTime(timeMs);
    if (navigator.vibrate) navigator.vibrate(40);
  } catch (error) {
    console.error(error);
    setStatus('Saved locally, but the score could not be stored yet.');
  }
}

async function tooSoon() {
  clearWaitTimer();
  stopAllGameSounds();
  ensureGameSounds();
  phase = 'tooSoon';

  playSound(failSound);

  breakCombo();
  triggerFailFlash();

  if (gameStage) {
    gameStage.classList.add('stage-fail', 'stage-glitch');
    setTimeout(() => gameStage.classList.remove('stage-fail', 'stage-glitch'), 800);
  }
  const _pf = document.getElementById('pressureFill');
  if (_pf) { _pf.style.transition = 'none'; _pf.style.width = '0%'; }

  const tooSoonMsg = TOO_SOON_MESSAGES[Math.floor(Math.random() * TOO_SOON_MESSAGES.length)];

  if (tooSlowIndicator) {
    tooSlowIndicator.textContent = tooSoonMsg;
    tooSlowIndicator.classList.remove('hidden');
    setTimeout(() => {
      tooSlowIndicator.textContent = 'TOO SLOW';
      tooSlowIndicator.classList.add('hidden');
    }, 700);
  }

  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 200]);
  }

  if (feedbackZone) {
    feedbackZone.classList.remove('hidden');
    feedbackZone.classList.add('too-soon');
  }

  if (feedbackMain) {
    feedbackMain.textContent = tooSoonMsg;
    feedbackMain.classList.add('too-soon-text');
    setTimeout(() => feedbackMain.classList.remove('too-soon-text'), 800);
  }

  if (feedbackSub) feedbackSub.textContent = 'You clicked during red. Wait for the screen to turn green.';

  if (stageCopy) {
    stageCopy.innerHTML = `
      <h3>Too early</h3>
      <p>Wait for the green screen next time.</p>
    `;
  }

  if (gameButton) {
    gameButton.textContent = 'Try again';
    gameButton.classList.remove('hidden');
  }

  try {
    if (currentUser) {
      profile.failedAttempts = (profile.failedAttempts ?? 0) + 1;
      await persistProfilePatch({ failedAttempts: profile.failedAttempts });
      updateStats().catch(() => {});
    }
  } catch (error) {
    console.error(error);
  }

  window.setTimeout(() => {
    if (phase === 'tooSoon') {
      if (feedbackZone) feedbackZone.classList.remove('too-soon');
      resetGameStage();
    }
  }, 1600);
}

async function tooLate(timeMs) {
  clearWaitTimer();
  stopAllGameSounds();
  ensureGameSounds();
  phase = 'tooLate';

  playSound(failSound);

  breakCombo();
  triggerFailFlash();

  if (gameStage) {
    gameStage.classList.add('stage-fail', 'stage-glitch');
    setTimeout(() => gameStage.classList.remove('stage-fail', 'stage-glitch'), 800);
  }
  const _pf = document.getElementById('pressureFill');
  if (_pf) { _pf.style.transition = 'none'; _pf.style.width = '0%'; }

  const lateMsg = getTooLateMessage(timeMs);

  if (tooSlowIndicator) {
    tooSlowIndicator.textContent = lateMsg.main;
    tooSlowIndicator.classList.remove('hidden');
    setTimeout(() => {
      tooSlowIndicator.textContent = 'TOO SLOW';
      tooSlowIndicator.classList.add('hidden');
    }, 700);
  }

  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 200]);
  }

  if (feedbackZone) {
    feedbackZone.classList.remove('hidden');
    feedbackZone.classList.add('too-soon');
  }

  if (feedbackMain) feedbackMain.textContent = lateMsg.main;
  if (feedbackSub) feedbackSub.textContent = lateMsg.sub;
  if (stageCopy) {
    stageCopy.innerHTML = `
      <h3>Too late</h3>
      <p>You were over the 600 ms limit.</p>
    `;
  }

  if (gameButton) {
    gameButton.textContent = 'Try again';
    gameButton.classList.remove('hidden');
  }

  try {
    if (currentUser) {
      profile.failedAttempts = (profile.failedAttempts ?? 0) + 1;
      await persistProfilePatch({ failedAttempts: profile.failedAttempts });
      updateStats().catch(() => {});
    }
  } catch (error) {
    console.error(error);
  }

  window.setTimeout(() => {
    if (phase === 'tooLate') {
      if (feedbackZone) feedbackZone.classList.remove('too-soon');
      resetGameStage();
    }
  }, 1600);
}

async function enterApp() {
  showView('play');
  listenLeaderboard();
  await updateStats();
  await updateProfileView();
  resetGameStage();
  loadRecentTimes();
  loadDailyChallenge().catch(() => {});
}

async function routeAfterLogin(user) {
  currentUser = user;

  profile = await ensureUserDoc(user);
  await updateProfileView();

  if (!profile.nickname) {
    showView('auth');
    if (nicknameInput && user.displayName) {
      nicknameInput.value = escapeNickname(user.displayName);
    }
    return;
  }

  // User has a nickname, automatically enter the app
  await enterApp();
}

function safeErrorMessage(error) {
  const code = error?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized in Firebase Authentication. Add your localhost or deployment domain in Firebase Console → Authentication → Settings → Authorized domains.';
  }
  if (code === 'auth/popup-blocked') return 'Popup blocked by the browser.';
  if (code === 'auth/popup-closed-by-user') return 'Sign-in was closed before it finished.';
  return error?.message || 'Something went wrong.';
}

function initializeEventListeners() {
  const tierPromotionClose = document.getElementById('tierPromotionClose');
  if (tierPromotionClose) {
    tierPromotionClose.addEventListener('click', dismissTierPromotion);
  }

  const navBrandClick = $('navBrandClick');

  // Logo click in game navbar goes to PLAY (not about)
  if (navBrandClick) {
    navBrandClick.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentView === 'play') return; // Already on play
      showView('play');
    });
  }
  
  // Color button selection in auth
  const colorBtns = document.querySelectorAll('.color-btn');
  if (colorBtns.length > 0) {
    colorBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const color = btn.dataset.color;
        
        // Update hidden input
        const colorInput = $('nicknameColor');
        if (colorInput) colorInput.value = color;
        
        // Update active state
        colorBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    // Set initial active state to first button
    if (colorBtns[0]) colorBtns[0].classList.add('active');
  }
  
  // Reset stats button
  const resetStatsBtn = $('resetStatsBtn');
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener('click', async () => {
      if (!currentUser) return;
      
      const confirm = window.confirm('Are you sure? This will delete all your stats and remove you from the leaderboard.');
      if (!confirm) return;
      
      try {
        setStatus('Resetting your stats...');
        
        // Delete from leaderboard
        const leaderboardRef = doc(db, 'leaderboard', currentUser.uid);
        await deleteDoc(leaderboardRef);
        
        // Reset user profile
        profile = await persistProfilePatch({
          bestTimeMs: null,
          lastTimeMs: null,
          averageTimeMs: null,
          attempts: 0,
          failedAttempts: 0
        });
        
        // Refresh displays immediately
        if (lastResult) lastResult.textContent = '—';
        if (bestResult) bestResult.textContent = '—';
        if (statsBestTime) statsBestTime.textContent = '—';
        if (statsWorstTime) statsWorstTime.textContent = '—';
        if (statsAttempts) statsAttempts.textContent = '0';
        if (statsAvgTime) statsAvgTime.textContent = '—';
        if (statsRank) statsRank.textContent = '—';
        applyTierToElement(document.getElementById('statsTier'), null);
        applyTierToElement(document.getElementById('profileTier'), null);
        
        // Clear leaderboard and re-listen
        leaderboard = [];
        if (leaderboardListFull) leaderboardListFull.innerHTML = '<li style="justify-content:center;color:var(--muted);">Be the first on the board.</li>';
        listenLeaderboard();
        
        setStatus('Stats reset successfully!');
        
        // Re-render leaderboard if viewing it
        if (currentView === 'leaderboard') renderLeaderboardFullFromMemory();
      } catch (error) {
        console.error(error);
        setStatus('Failed to reset stats.');
      }
    });
  }
  
  if (nicknameForm) {
    nicknameForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nickname = escapeNickname(nicknameInput?.value);
      const color = nicknameColor?.value || '#E8B923';

      if (!nickname) {
        setStatus('Please enter a nickname.');
        return;
      }

      try {
        setStatus('Checking nickname availability...');
        
        // Check if nickname + color combination already exists
        const leaderboardSnap = await getDoc(doc(db, 'leaderboard', nickname + color));
        const usersSnap = await getDoc(doc(db, 'users', nickname + color));
        
        // Query leaderboard for existing nickname+color combo
        const leaderboardQuery = query(
          collection(db, 'leaderboard'),
          where('nickname', '==', nickname),
          where('nicknameColor', '==', color)
        );
        const leaderboardDocs = await getDocs(leaderboardQuery);
        
        if (leaderboardDocs.size > 0) {
          setStatus('This nickname with this color is already taken. Choose a different combination.');
          return;
        }
        
        setStatus('Starting game...');

        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }

        currentUser = auth.currentUser || currentUser;

        if (!currentUser) {
          throw new Error('Unable to start session.');
        }

        profile = await ensureUserDoc(currentUser);
        await saveNickname(nickname, color);
        await enterApp();
      } catch (error) {
        console.error('Auth error:', error);
        setStatus(safeErrorMessage(error));
      }
    });
  } else {
    console.warn('nicknameForm element not found');
  }

  if (navTabs.length) {
    navTabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        showView(view);
        if (view === 'leaderboard') renderLeaderboardFullFromMemory();
        if (view === 'stats') updateStats().catch(console.error);
        if (view === 'profile') updateProfileView().catch(() => {});
      });
    });
  }

  if (gameButton) {
    gameButton.addEventListener('click', () => {
      if (!currentUser || !profile?.nickname) return;

      if (phase === 'idle' || phase === 'result' || phase === 'tooSoon') {
        startRound();
        return;
      }

      if (phase === 'waiting') {
        tooSoon();
        return;
      }

      if (phase === 'go') {
        const timeMs = performance.now() - startTime;
        if (timeMs > 600) {
          tooLate(timeMs);
          return;
        }

        stopAllGameSounds();
        ensureGameSounds();
        playSound(greenClickSound);
        finishRound(timeMs).catch(console.error);
      }
    });
  }

  // Difficulty button listeners
  const difficultyBtns = document.querySelectorAll('.difficulty-btn');
  if (difficultyBtns.length > 0) {
    difficultyBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const difficulty = btn.dataset.difficulty;
        if (!difficulty) return;
        
        // Update global state
        currentDifficulty = difficulty;
        
        // Update active button state
        difficultyBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Reset game stage if in progress
        if (phase !== 'idle') {
          resetGameStage();
        }
      });
    });
    
    // Set initial active state to easy button
    const easyBtn = document.querySelector('[data-difficulty="easy"]');
    if (easyBtn) easyBtn.classList.add('active');
  }

  if (gameStage) {
    gameStage.addEventListener('click', (e) => {
      if (e.target === gameButton) return;
      gameButton?.click();
    });
  }

  if (feedbackAgainBtn) {
    feedbackAgainBtn.addEventListener('click', () => {
      resetGameStage();
      startRound();
    });
  }
}

// Initialize event listeners when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEventListeners);
} else {
  initializeEventListeners();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    profile = null;
    leaderboard = [];
    clearWaitTimer();
    stopAllGameSounds();
    showView('auth');
    setStatus('Not signed in.');

    if (nicknameInput) nicknameInput.value = '';

    if (leaderboardUnsub) {
      leaderboardUnsub();
      leaderboardUnsub = null;
    }

    if (leaderboardListFull) leaderboardListFull.innerHTML = '';
    if (leaderNickFull) leaderNickFull.textContent = '—';
    if (leaderTimeFull) leaderTimeFull.textContent = '—';

    resetGameStage();
    return;
  }

  try {
    await routeAfterLogin(user);
  } catch (error) {
    console.error(error);
    setStatus(safeErrorMessage(error));
  }
});

resetGameStage();
showView('auth');
setStatus('Enter a nickname to begin.');
