
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
  serverTimestamp
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

function setStageState(state) {
  if (!gameStage) return;
  gameStage.classList.remove('idle', 'waiting', 'go');
  gameStage.classList.add(state);
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
  comboDisplay.classList.remove('combo-break', 'milestone');
  
  // Milestone animations every 5 combos
  if (comboCount > 0 && comboCount % 5 === 0) {
    comboDisplay.classList.add('milestone');
  }
}

function breakCombo() {
  if (comboCount > 0) {
    const comboDisplay = document.getElementById('comboDisplay');
    if (comboDisplay) {
      comboDisplay.classList.add('combo-break');
      setTimeout(() => comboDisplay.classList.remove('combo-break'), 400);
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
        <div class="nick" style="color:${nickColor};">${row.nickname || 'Anonymous'}</div>
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
        <div class="nick" style="color:${nickColor};">${row.nickname || 'Anonymous'}</div>
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

  // Get difficulty-based wait times
  const config = getDifficultyConfig(currentDifficulty);
  const delay = Math.floor(config.waitMin + Math.random() * (config.waitMax - config.waitMin));
  
  waitTimer = window.setTimeout(() => {
    phase = 'go';
    startTime = performance.now();
    setStageState('go');

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
}

async function finishRound(timeMs) {
  clearWaitTimer();
  stopAllGameSounds();
  phase = 'result';
  setStageState('idle');

  // Increment combo on successful click
  comboCount++;
  if (comboCount > sessionHighestCombo) {
    sessionHighestCombo = comboCount;
  }
  updateComboDisplay();

  const feedback = getFeedbackMessage(timeMs);
  const recordText = getRecordMessage(timeMs, profile?.bestTimeMs ?? null);

  if (feedbackZone) {
    feedbackZone.classList.remove('hidden');
    feedbackZone.classList.toggle(
      'record-break',
      typeof profile?.bestTimeMs === 'number' && timeMs < profile.bestTimeMs
    );
  }

  if (feedbackMain) feedbackMain.textContent = formatMs(timeMs);
  if (feedbackSub) feedbackSub.textContent = `${feedback.main}. ${recordText}`;
  if (stageCopy) stageCopy.innerHTML = '';
  if (gameButton) gameButton.classList.add('hidden');

  playSound(greenClickSound);

  try {
    await saveResult(timeMs);
    updateStats().catch(() => {});
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

  // Break combo
  breakCombo();

  // DRAMATIC FAILURE EFFECTS
  if (gameStage) {
    gameStage.classList.add('stage-fail');
    // Remove animation class after animation ends
    setTimeout(() => {
      gameStage.classList.remove('stage-fail');
    }, 800);
  }

  // Show "TOO SLOW" indicator
  if (tooSlowIndicator) {
    tooSlowIndicator.classList.remove('hidden');
    setTimeout(() => {
      tooSlowIndicator.classList.add('hidden');
    }, 600);
  }

  // Trigger vibration on mobile
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 200]);
  }

  if (feedbackZone) {
    feedbackZone.classList.remove('hidden');
    feedbackZone.classList.add('too-soon');
  }

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

  if (gameStage) {
    gameStage.classList.add('stage-fail');
    setTimeout(() => {
      gameStage.classList.remove('stage-fail');
    }, 800);
  }

  if (tooSlowIndicator) {
    tooSlowIndicator.textContent = 'TOO LATE';
    tooSlowIndicator.classList.remove('hidden');
    setTimeout(() => {
      tooSlowIndicator.textContent = 'TOO SLOW';
      tooSlowIndicator.classList.add('hidden');
    }, 600);
  }

  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 200]);
  }

  if (feedbackZone) {
    feedbackZone.classList.remove('hidden');
    feedbackZone.classList.add('too-soon');
  }

  if (feedbackMain) feedbackMain.textContent = formatMs(timeMs);
  if (feedbackSub) feedbackSub.textContent = 'Too late — click within 600 ms on the green screen.';
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