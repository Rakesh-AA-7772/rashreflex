import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js';
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
  serverTimestamp,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);
const googleProvider = new GoogleAuthProvider();

await setPersistence(auth, browserLocalPersistence);
auth.languageCode = 'en';

// DOM Elements
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

let currentUser = null;
let profile = null;
let allUsers = [];
let phase = 'idle'; // idle | waiting | go | result
let waitTimer = null;
let startTime = 0;
let leaderboardUnsub = null;
let currentView = 'play';

function setStatus(message) {
  authStatus.textContent = message;
}

function showView(view) {
  authView.classList.toggle('hidden', view !== 'auth');
  nicknameView.classList.toggle('hidden', view !== 'nickname');
  playView.classList.toggle('hidden', view !== 'play');
  leaderboardView.classList.toggle('hidden', view !== 'leaderboard');
  statsView.classList.toggle('hidden', view !== 'stats');
  profileView.classList.toggle('hidden', view !== 'profile');
  aboutView.classList.toggle('hidden', view !== 'about');
  topNav.classList.toggle('hidden', view === 'auth' || view === 'nickname');
  currentView = view;
  
  // Update nav active tab
  navTabs.forEach(btn => btn.classList.remove('active'));
  const activeTab = document.querySelector(`[data-view="${view}"]`);
  if (activeTab) activeTab.classList.add('active');
}

function formatMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  return `${Math.round(ms)} ms`;
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate?.() || new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function escapeNickname(name) {
  return name.trim().replace(/\s+/g, ' ').slice(0, 20);
}

async function getOrCreateProfile(user) {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    return null;
  }
  return snap.data();
}

async function saveNickname(nickname) {
  if (!currentUser) return;
  const clean = escapeNickname(nickname);
  if (!clean) throw new Error('Nickname cannot be empty.');
  const userRef = doc(db, 'users', currentUser.uid);
  const payload = {
    uid: currentUser.uid,
    email: currentUser.email,
    nickname: clean,
    bestTimeMs: profile?.bestTimeMs ?? null,
    updatedAt: serverTimestamp()
  };
  if (!profile) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(userRef, payload, { merge: true });
  profile = { ...(profile || {}), ...payload, nickname: clean };
}

function resetGameStage() {
  clearTimeout(waitTimer);
  phase = 'idle';
  gameStage.classList.remove('waiting', 'go');
  gameStage.classList.add('idle');
  feedbackZone.classList.add('hidden');
  stageCopy.innerHTML = `
    <h3>Click to get started</h3>
    <p>Wait for the screen to turn green. Click too early and you will have to restart.</p>
  `;
  gameButton.textContent = 'Click to get started';
  gameButton.disabled = false;
  gameButton.classList.remove('hidden');
}

function startRound() {
  if (!currentUser || !profile?.nickname) return;
  phase = 'waiting';
  gameStage.classList.remove('idle', 'go');
  gameStage.classList.add('waiting');
  feedbackZone.classList.add('hidden');
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
    gameStage.classList.remove('waiting');
    gameStage.classList.add('go');
    stageCopy.innerHTML = `
      <h3>Green screen</h3>
      <p>Green screen is live. Click now!</p>
    `;
    gameButton.textContent = 'Click!';
  }, delay);
}

async function saveResult(timeMs) {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  const prevBest = typeof profile?.bestTimeMs === 'number' ? profile.bestTimeMs : null;
  const newBest = prevBest === null ? timeMs : Math.min(prevBest, timeMs);
  const attempts = (profile?.attempts ?? 0) + 1;

  await setDoc(userRef, {
    uid: currentUser.uid,
    email: currentUser.email,
    nickname: profile.nickname,
    bestTimeMs: newBest,
    lastTimeMs: timeMs,
    attempts: attempts,
    updatedAt: serverTimestamp(),
    ...(profile?.createdAt ? {} : { createdAt: serverTimestamp() })
  }, { merge: true });

  profile.bestTimeMs = newBest;
  profile.lastTimeMs = timeMs;
  profile.attempts = attempts;
  lastResult.textContent = formatMs(timeMs);
  bestResult.textContent = formatMs(newBest);
}

function getFeedbackMessage(timeMs) {
  if (timeMs < 100) return { main: '🐐 GOAT LEVEL 🐐', level: 'goat' };
  if (timeMs < 200) return { main: '⚡ INSANE ⚡', level: 'insane' };
  if (timeMs < 300) return { main: '✓ GOOD', level: 'good' };
  if (timeMs > 700) return { main: '🐢 EVEN TORTOISE IS BETTER THAN YOU LOL', level: 'tortoise' };
  return { main: '✓ NOT BAD', level: 'ok' };
}

function getRecordMessage(timeMs, bestTime) {
  if (bestTime === null || bestTime === undefined) return '🎯 First attempt - looking good!';
  
  if (timeMs < bestTime) {
    const improvement = Math.round(bestTime - timeMs);
    return `🔥 RECORD TIME! 🔥 ${improvement} ms faster!`;
  }
  
  const distance = Math.round(timeMs - bestTime);
  if (distance < 10) return `⚡ So close! Only ${distance} ms away from record.`;
  if (distance < 50) return `📊 ${distance} ms away from your record.`;
  return `📊 ${distance} ms away from your best: ${formatMs(bestTime)}`;
}

function finishRound(timeMs) {
  phase = 'result';
  clearTimeout(waitTimer);
  gameStage.classList.remove('waiting', 'go');
  gameStage.classList.add('idle');
  
  const feedback = getFeedbackMessage(timeMs);
  const recordMsg = getRecordMessage(timeMs, profile?.bestTimeMs ?? null);
  
  feedbackZone.classList.remove('hidden', 'record-break');
  if (timeMs < profile?.bestTimeMs) {
    feedbackZone.classList.add('record-break');
  }
  feedbackMain.textContent = feedback.main;
  feedbackSub.textContent = recordMsg;
  
  stageCopy.innerHTML = '';
  gameButton.classList.add('hidden');
  
  void saveResult(timeMs);
}

function tooSoon() {
  clearTimeout(waitTimer);
  phase = 'idle';
  gameStage.classList.remove('go');
  gameStage.classList.add('waiting');
  feedbackZone.classList.add('hidden');
  stageCopy.innerHTML = `
    <h3>Too early 😅</h3>
    <p>Wait for the green screen next time.</p>
  `;
  gameButton.textContent = 'Try again';
  gameButton.disabled = false;
  gameButton.classList.remove('hidden');
  setTimeout(() => {
    if (phase !== 'go') resetGameStage();
  }, 1100);
}

function renderLeaderboard(rows) {
  leaderboardList.innerHTML = '';
  if (!rows.length) {
    leaderNick.textContent = 'No scores yet';
    leaderTime.textContent = '—';
    leaderboardList.innerHTML = '<li style="justify-content:center;color:var(--muted);">Be the first on the board.</li>';
    return;
  }

  const [first] = rows;
  leaderNick.textContent = first.nickname || 'Anonymous';
  leaderTime.textContent = formatMs(first.bestTimeMs);

  rows.forEach((row, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="lb-left">
        <div class="rank">${index + 1}</div>
        <div class="nick">${row.nickname || 'Anonymous'}</div>
      </div>
      <div class="time">${formatMs(row.bestTimeMs)}</div>
    `;
    leaderboardList.appendChild(li);
  });
}

function listenLeaderboard() {
  if (leaderboardUnsub) leaderboardUnsub();
  const q = query(collection(db, 'users'), orderBy('bestTimeMs', 'asc'), limit(10));
  leaderboardUnsub = onSnapshot(q, (snap) => {
    const rows = snap.docs
      .map((doc) => doc.data())
      .filter((item) => typeof item.bestTimeMs === 'number');
    renderLeaderboard(rows);
    if (currentView === 'leaderboard') renderLeaderboardFull(rows);
    allUsers = rows;
  }, () => {
    leaderboardList.innerHTML = '<li style="justify-content:center;color:var(--muted);">Leaderboard unavailable right now.</li>';
  });
}

function renderLeaderboardFull(rows) {
  leaderboardListFull.innerHTML = '';
  if (!rows.length) {
    leaderboardListFull.innerHTML = '<li style="justify-content:center;color:var(--muted);">No scores yet. Be the first!</li>';
    return;
  }

  rows.forEach((row, index) => {
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

async function updateStats() {
  if (!profile) return;
  
  // Get all times for this user
  const userRef = doc(db, 'users', currentUser.uid);
  const snap = await getDoc(userRef);
  const userData = snap.data();
  
  const bestTime = userData?.bestTimeMs;
  const lastTime = userData?.lastTimeMs;
  const attempts = userData?.attempts ?? 0;
  
  // Get stats
  statsBestTime.textContent = formatMs(bestTime);
  statsWorstTime.textContent = formatMs(lastTime);
  statsAttempts.textContent = attempts || '0';
  statsSuccess.textContent = attempts > 0 ? '100%' : '—';
  
  // Calculate rank
  if (allUsers.length > 0 && bestTime) {
    const rank = allUsers.findIndex(u => u.bestTimeMs === bestTime) + 1;
    const totalUsers = allUsers.length;
    statsRank.textContent = `#${rank} of ${totalUsers}`;
  } else {
    statsRank.textContent = '—';
  }
  
  // Average time (we'll estimate from best and last)
  if (bestTime && lastTime) {
    const avgEstimate = Math.round((bestTime + lastTime) / 2);
    statsAvgTime.textContent = formatMs(avgEstimate);
  } else if (bestTime) {
    statsAvgTime.textContent = formatMs(bestTime);
  } else {
    statsAvgTime.textContent = '—';
  }
}

function updateProfileView() {
  if (!currentUser || !profile) return;
  
  profileNickname.textContent = profile.nickname || '—';
  profileEmail.textContent = currentUser.email || '—';
  profileJoined.textContent = formatDate(profile.createdAt);
  navProfilePill.textContent = profile.nickname || currentUser.email || '—';
}

async function routeAfterLogin(user) {
  currentUser = user;
  setStatus(`Signed in as ${user.email}.`);
  const existing = await getOrCreateProfile(user);
  profile = existing;

  if (!existing || !existing.nickname) {
    showView('nickname');
    nicknameInput.value = existing?.nickname || '';
    return;
  }

  showView('play');
  updateProfileView();
  listenLeaderboard();
  updateStats();
  resetGameStage();
}

// Navigation
navTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    showView(view);
    if (view === 'leaderboard' && allUsers.length > 0) {
      renderLeaderboardFull(allUsers);
    }
    if (view === 'stats') {
      updateStats();
    }
    if (view === 'profile') {
      updateProfileView();
    }
  });
});

// Auth tabs
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.authTab;
    emailAuthForm.classList.toggle('hidden', tab !== 'email');
    googleAuthPanel.classList.toggle('hidden', tab !== 'google');
  });


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
      if (error.code === 'auth/user-not-found') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await routeAfterLogin(cred.user);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Login failed.');
  }
});

googleSignInBtn.addEventListener('click', async () => {
  try {
    setStatus('Opening Google sign-in...');
    const cred = await signInWithPopup(auth, googleProvider);
    await routeAfterLogin(cred.user);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Google sign-in failed.');
  }
});

logoutFromAuth.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
  }
});

nicknameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const nickname = escapeNickname(nicknameInput.value);
    await saveNickname(nickname);
    showView('play');
    updateProfileView();
    listenLeaderboard();
    updateStats();
    resetGameStage();
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Could not save nickname.');
  }
});

// Profile management
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
    changeNicknameForm.classList.add('hidden');
    updateProfileView();
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Could not update nickname.');
  }
});

profileLogoutBtn.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
  }
});

// Game interaction
gameButton.addEventListener('click', () => {
  if (!currentUser || !profile?.nickname) return;
  if (phase === 'idle' || phase === 'result') {
    feedbackAgainBtn.onclick = null;
    gameButton.classList.remove('hidden');
    startRound();
    return;
  }
  if (phase === 'waiting') {
    tooSoon();
    return;
  }
  if (phase === 'go') {
    const timeMs = performance.now() - startTime;
    finishRound(timeMs);
  }
});

feedbackAgainBtn.addEventListener('click', () => {
  resetGameStage();
  startRound();
});

gameStage.addEventListener('click', (e) => {
  if (e.target === gameButton) return;
  gameButton.click();
});

// Auth state
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    profile = null;
    showView('auth');
    if (leaderboardUnsub) leaderboardUnsub();
    authStatus.textContent = 'Not signed in.';
    authEmail.value = '';
    authPassword.value = '';
    return;
  }
  await routeAfterLogin(user);
});

resetGameStage();
