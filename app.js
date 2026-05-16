import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: 'select_account' });
auth.languageCode = 'en';

await setPersistence(auth, browserLocalPersistence);

const topNav = document.getElementById('topNav');
const authView = document.getElementById('authView');
const nicknameView = document.getElementById('nicknameView');
const playView = document.getElementById('playView');
const leaderboardView = document.getElementById('leaderboardView');
const statsView = document.getElementById('statsView');
const profileView = document.getElementById('profileView');
const aboutView = document.getElementById('aboutView');

const emailAuthForm = document.getElementById('emailAuthForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authStatus = document.getElementById('authStatus');
const nicknameForm = document.getElementById('nicknameForm');
const nicknameInput = document.getElementById('nicknameInput');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const googleAuthPanel = document.getElementById('googleAuthPanel');
const logoutFromAuth = document.getElementById('logoutFromAuth');
const tabBtns = [...document.querySelectorAll('.tab-btn')];

const navTabs = [...document.querySelectorAll('.nav-tab')];
const navProfilePill = document.getElementById('navProfilePill');

const gameStage = document.getElementById('gameStage');
const gameButton = document.getElementById('gameButton');
const stageCopy = document.getElementById('stageCopy');
const feedbackZone = document.getElementById('feedbackZone');
const feedbackMain = document.getElementById('feedbackMain');
const feedbackSub = document.getElementById('feedbackSub');
const feedbackAgainBtn = document.getElementById('feedbackAgainBtn');
const lastResult = document.getElementById('lastResult');
const bestResult = document.getElementById('bestResult');

const leaderNick = document.getElementById('leaderNick');
const leaderTime = document.getElementById('leaderTime');
const leaderboardList = document.getElementById('leaderboardList');
const leaderboardListFull = document.getElementById('leaderboardListFull');

const statsBestTime = document.getElementById('statsBestTime');
const statsAvgTime = document.getElementById('statsAvgTime');
const statsWorstTime = document.getElementById('statsWorstTime');
const statsAttempts = document.getElementById('statsAttempts');
const statsRank = document.getElementById('statsRank');
const statsSuccess = document.getElementById('statsSuccess');

const profileNickname = document.getElementById('profileNickname');
const profileEmail = document.getElementById('profileEmail');
const profileJoined = document.getElementById('profileJoined');
const profileChangeNicknameBtn = document.getElementById('profileChangeNicknameBtn');
const profileLogoutBtn = document.getElementById('profileLogoutBtn');
const changeNicknameForm = document.getElementById('changeNicknameForm');
const nicknameFormProfile = document.getElementById('nicknameFormProfile');
const nicknameInputProfile = document.getElementById('nicknameInputProfile');
const cancelNicknameBtn = document.getElementById('cancelNicknameBtn');
const techFootnote = document.getElementById('techFootnote');

let currentUser = null;
let profile = null;
let leaderboard = [];
let currentView = 'play';
let leaderboardUnsub = null;
let waitTimer = null;
let startTime = 0;
let phase = 'idle';

function setStatus(message) {
  authStatus.textContent = message;
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
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function clearWaitTimer() {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}

function setStageState(state) {
  gameStage.classList.remove('idle', 'waiting', 'go');
  gameStage.classList.add(state);
}

function showView(view) {
  authView.classList.toggle('hidden', view !== 'auth');
  nicknameView.classList.toggle('hidden', view !== 'nickname');
  playView.classList.toggle('hidden', view !== 'play');
  leaderboardView.classList.toggle('hidden', view !== 'leaderboard');
  statsView.classList.toggle('hidden', view !== 'stats');
  profileView.classList.toggle('hidden', view !== 'profile');
  aboutView.classList.toggle('hidden', view !== 'about');
  techFootnote.classList.toggle('hidden', view === 'auth' || view === 'nickname');
  topNav.classList.toggle('hidden', view === 'auth' || view === 'nickname');
  currentView = view;

  navTabs.forEach((btn) => btn.classList.remove('active'));
  const activeTab = document.querySelector(`[data-view="${view}"]`);
  if (activeTab) activeTab.classList.add('active');
}

function resetGameStage() {
  clearWaitTimer();
  phase = 'idle';
  setStageState('idle');
  feedbackZone.classList.add('hidden');
  feedbackZone.classList.remove('record-break');
  stageCopy.innerHTML = `
    <h3>Click to get started</h3>
    <p>Wait for the screen to turn green. Click too early and you will have to restart.</p>
  `;
  gameButton.textContent = 'Click to get started';
  gameButton.disabled = false;
  gameButton.classList.remove('hidden');
}

async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const fresh = {
      uid: user.uid,
      email: user.email || '',
      provider: user.providerData?.[0]?.providerId || 'password',
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
    await setDoc(ref, {
      uid: currentUser.uid,
      nickname: profile.nickname,
      bestTimeMs: profile.bestTimeMs,
      lastTimeMs: profile.lastTimeMs ?? profile.bestTimeMs,
      attempts: profile.attempts ?? 0,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return;
  }

  const prevBest = typeof profile.bestTimeMs === 'number' ? profile.bestTimeMs : null;
  const newBest = prevBest === null ? timeMs : Math.min(prevBest, timeMs);
  const attempts = (profile.attempts ?? 0) + 1;

  await setDoc(ref, {
    uid: currentUser.uid,
    nickname: profile.nickname,
    bestTimeMs: newBest,
    lastTimeMs: timeMs,
    attempts,
    updatedAt: serverTimestamp(),
    createdAt: profile.createdAt || serverTimestamp()
  }, { merge: true });

  profile.bestTimeMs = newBest;
  profile.lastTimeMs = timeMs;
  profile.attempts = attempts;
}

async function saveNickname(rawNickname) {
  const nickname = escapeNickname(rawNickname);
  if (!nickname) throw new Error('Nickname cannot be empty.');

  await persistProfilePatch({ nickname });

  if (profile?.bestTimeMs !== null && profile?.bestTimeMs !== undefined) {
    await syncLeaderboardDoc(profile.bestTimeMs, 'nickname');
  }
}

function renderLeaderboard(rows) {
  const safeRows = rows.filter((row) => typeof row.bestTimeMs === 'number' && row.bestTimeMs > 0);
  leaderboard = safeRows;

  leaderboardList.innerHTML = '';
  leaderboardListFull.innerHTML = '';

  if (!safeRows.length) {
    leaderNick.textContent = 'No scores yet';
    leaderTime.textContent = '—';
    const empty = '<li style="justify-content:center;color:var(--muted);">Be the first on the board.</li>';
    leaderboardList.innerHTML = empty;
    leaderboardListFull.innerHTML = empty;
    return;
  }

  const first = safeRows[0];
  leaderNick.textContent = first.nickname || 'Anonymous';
  leaderTime.textContent = formatMs(first.bestTimeMs);

  safeRows.forEach((row, index) => {
    const makeItem = () => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="lb-left">
          <div class="rank">${index + 1}</div>
          <div class="nick">${row.nickname || 'Anonymous'}</div>
        </div>
        <div class="time">${formatMs(row.bestTimeMs)}</div>
      `;
      return li;
    };
    leaderboardList.appendChild(makeItem());
    leaderboardListFull.appendChild(makeItem());
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
      leaderNick.textContent = 'Unavailable';
      leaderTime.textContent = '—';
      leaderboardList.innerHTML = '<li style="justify-content:center;color:var(--muted);">Leaderboard unavailable right now.</li>';
      leaderboardListFull.innerHTML = '<li style="justify-content:center;color:var(--muted);">Leaderboard unavailable right now.</li>';
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

  statsBestTime.textContent = formatMs(bestTime);
  statsWorstTime.textContent = formatMs(lastTime);
  statsAttempts.textContent = String(attempts);

  if (attempts > 0 || failedAttempts > 0) {
    const total = attempts + failedAttempts;
    const successRate = total > 0 ? Math.round((attempts / total) * 100) : 0;
    statsSuccess.textContent = `${successRate}%`;
  } else {
    statsSuccess.textContent = '—';
  }

  if (typeof bestTime === 'number' && leaderboard.length) {
    const rank = leaderboard.findIndex((row) => row.id === currentUser.uid) + 1;
    statsRank.textContent = rank > 0 ? `#${rank} of ${leaderboard.length}` : '—';
  } else {
    statsRank.textContent = '—';
  }

  if (typeof bestTime === 'number' && typeof lastTime === 'number') {
    statsAvgTime.textContent = formatMs((bestTime + lastTime) / 2);
  } else if (typeof bestTime === 'number') {
    statsAvgTime.textContent = formatMs(bestTime);
  } else {
    statsAvgTime.textContent = '—';
  }
}

async function updateProfileView() {
  if (!currentUser || !profile) return;

  profileNickname.textContent = profile.nickname || '—';
  profileEmail.textContent = currentUser.email || '—';
  profileJoined.textContent = formatDate(profile.createdAt);
  navProfilePill.textContent = profile.nickname || currentUser.email || '—';

  lastResult.textContent = formatMs(profile.lastTimeMs ?? null);
  bestResult.textContent = formatMs(profile.bestTimeMs ?? null);

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

  lastResult.textContent = formatMs(timeMs);
  bestResult.textContent = formatMs(bestTimeMs);
}

function startRound() {
  if (!currentUser || !profile?.nickname) return;

  clearWaitTimer();
  phase = 'waiting';
  feedbackZone.classList.add('hidden');
  feedbackZone.classList.remove('record-break');
  setStageState('waiting');
  stageCopy.innerHTML = `
    <h3>Red screen</h3>
    <p>Stay calm. Wait for green.</p>
  `;
  gameButton.textContent = 'Waiting...';
  gameButton.disabled = false;

  const delay = Math.floor(1500 + Math.random() * 3500);
  waitTimer = window.setTimeout(() => {
    phase = 'go';
    startTime = performance.now();
    setStageState('go');
    stageCopy.innerHTML = `
      <h3>Green screen</h3>
      <p>Click now.</p>
    `;
    gameButton.textContent = 'Click!';
  }, delay);
}

async function finishRound(timeMs) {
  clearWaitTimer();
  phase = 'result';
  setStageState('idle');

  const feedback = getFeedbackMessage(timeMs);
  const recordText = getRecordMessage(timeMs, profile?.bestTimeMs ?? null);

  feedbackZone.classList.remove('hidden');
  feedbackZone.classList.toggle('record-break', typeof profile?.bestTimeMs === 'number' && timeMs < profile.bestTimeMs);
  feedbackMain.textContent = feedback.main;
  feedbackSub.textContent = recordText;
  stageCopy.innerHTML = '';
  gameButton.classList.add('hidden');

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
  phase = 'tooSoon';
  setStageState('waiting');
  feedbackZone.classList.add('hidden');
  stageCopy.innerHTML = `
    <h3>Too early</h3>
    <p>Wait for the green screen next time.</p>
  `;
  gameButton.textContent = 'Try again';
  gameButton.classList.remove('hidden');

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
    if (phase === 'tooSoon') resetGameStage();
  }, 1100);
}

async function routeAfterLogin(user) {
  currentUser = user;
  setStatus(`Signed in as ${user.email || user.uid}.`);

  profile = await ensureUserDoc(user);
  updateProfileView().catch(() => {});

  if (!profile.nickname) {
    showView('nickname');
    nicknameInput.value = user.displayName || user.email?.split('@')[0] || '';
    return;
  }

  showView('play');
  listenLeaderboard();
  await updateStats();
  resetGameStage();
}

function safeErrorMessage(error) {
  const code = error?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized in Firebase Authentication. Add your localhost or Vercel domain in Firebase Console → Authentication → Settings → Authorized domains.';
  }
  if (code === 'auth/wrong-password') return 'Wrong password. Please try again.';
  if (code === 'auth/invalid-credential') return 'Invalid login details.';
  if (code === 'auth/popup-blocked') return 'Popup blocked by the browser.';
  if (code === 'auth/popup-closed-by-user') return 'Google sign-in was closed before it finished.';
  return error?.message || 'Something went wrong.';
}

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.authTab;
    emailAuthForm.classList.toggle('hidden', tab !== 'email');
    googleAuthPanel.classList.toggle('hidden', tab !== 'google');
  });
});

navTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    showView(view);
    if (view === 'leaderboard') renderLeaderboardFullFromMemory();
    if (view === 'stats') updateStats().catch(console.error);
    if (view === 'profile') updateProfileView().catch(() => {});
  });
});

function renderLeaderboardFullFromMemory() {
  leaderboardListFull.innerHTML = '';
  if (!leaderboard.length) {
    leaderboardListFull.innerHTML = '<li style="justify-content:center;color:var(--muted);">Be the first on the board.</li>';
    return;
  }

  leaderboard.forEach((row, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="lb-left">
        <div class="rank">${index + 1}</div>
        <div class="nick">${row.nickname || 'Anonymous'}</div>
      </div>
      <div class="time">${formatMs(row.bestTimeMs)}</div>
    `;
    leaderboardListFull.appendChild(li);
  });
}

emailAuthForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;

  try {
    setStatus('Signing in...');
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await routeAfterLogin(cred.user);
    } catch (error) {
      if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/user-not-found') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await routeAfterLogin(cred.user);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error(error);
    setStatus(safeErrorMessage(error));
  }
});

googleSignInBtn.addEventListener('click', async () => {
  try {
    setStatus('Opening Google sign-in...');
    const cred = await signInWithPopup(auth, googleProvider);
    await routeAfterLogin(cred.user);
  } catch (error) {
    console.error(error);
    setStatus(safeErrorMessage(error));
  }
});

logoutFromAuth.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    setStatus(safeErrorMessage(error));
  }
});

nicknameForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const nickname = escapeNickname(nicknameInput.value);
    await saveNickname(nickname);
    showView('play');
    listenLeaderboard();
    await updateStats();
    await updateProfileView();
    resetGameStage();
  } catch (error) {
    console.error(error);
    setStatus(safeErrorMessage(error));
  }
});

profileChangeNicknameBtn.addEventListener('click', () => {
  nicknameInputProfile.value = profile?.nickname || '';
  changeNicknameForm.classList.remove('hidden');
});

cancelNicknameBtn.addEventListener('click', () => {
  changeNicknameForm.classList.add('hidden');
});

nicknameFormProfile.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const nickname = escapeNickname(nicknameInputProfile.value);
    await saveNickname(nickname);
    await updateProfileView();
    changeNicknameForm.classList.add('hidden');
    if (currentView === 'leaderboard') renderLeaderboardFullFromMemory();
  } catch (error) {
    console.error(error);
    setStatus(safeErrorMessage(error));
  }
});

profileLogoutBtn.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
  }
});

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
    finishRound(timeMs).catch(console.error);
  }
});

gameStage.addEventListener('click', (e) => {
  if (e.target === gameButton) return;
  gameButton.click();
});

feedbackAgainBtn.addEventListener('click', () => {
  resetGameStage();
  startRound();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    profile = null;
    leaderboard = [];
    clearWaitTimer();
    showView('auth');
    setStatus('Not signed in.');
    authEmail.value = '';
    authPassword.value = '';
    if (leaderboardUnsub) {
      leaderboardUnsub();
      leaderboardUnsub = null;
    }
    leaderboardList.innerHTML = '';
    leaderboardListFull.innerHTML = '';
    leaderNick.textContent = '—';
    leaderTime.textContent = '—';
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
