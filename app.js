import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
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
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
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
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

await setPersistence(auth, browserLocalPersistence);

auth.languageCode = 'en';

const authView = document.getElementById('authView');
const nicknameView = document.getElementById('nicknameView');
const gameView = document.getElementById('gameView');
const authStatus = document.getElementById('authStatus');
const emailAuthForm = document.getElementById('emailAuthForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const logoutFromAuth = document.getElementById('logoutFromAuth');
const nicknameForm = document.getElementById('nicknameForm');
const nicknameInput = document.getElementById('nicknameInput');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const googleAuthPanel = document.getElementById('googleAuthPanel');
const tabBtns = [...document.querySelectorAll('.tab-btn')];
const welcomeLine = document.getElementById('welcomeLine');
const profilePill = document.getElementById('profilePill');
const gameStage = document.getElementById('gameStage');
const gameButton = document.getElementById('gameButton');
const stageCopy = document.getElementById('stageCopy');
const lastResult = document.getElementById('lastResult');
const bestResult = document.getElementById('bestResult');
const leaderNick = document.getElementById('leaderNick');
const leaderTime = document.getElementById('leaderTime');
const leaderboardList = document.getElementById('leaderboardList');

let currentUser = null;
let profile = null;
let phase = 'idle'; // idle | waiting | go | result
let waitTimer = null;
let startTime = 0;
let leaderboardUnsub = null;

function setStatus(message) {
  authStatus.textContent = message;
}

function showSection(state) {
  authView.classList.toggle('hidden', state !== 'auth');
  nicknameView.classList.toggle('hidden', state !== 'nickname');
  gameView.classList.toggle('hidden', state !== 'game');
}

function formatMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  return `${Math.round(ms)} ms`;
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
  stageCopy.innerHTML = `
    <h3>Click to get started</h3>
    <p>Wait for the screen to turn green. Click too early and you will have to restart.</p>
  `;
  gameButton.textContent = 'Click to get started';
  gameButton.disabled = false;
}

function startRound() {
  if (!currentUser || !profile?.nickname) return;
  phase = 'waiting';
  gameStage.classList.remove('idle', 'go');
  gameStage.classList.add('waiting');
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
      <h3>Click now</h3>
      <p>Green screen is live.</p>
    `;
    gameButton.textContent = 'Click!';
  }, delay);
}

async function saveResult(timeMs) {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  const prevBest = typeof profile?.bestTimeMs === 'number' ? profile.bestTimeMs : null;
  const newBest = prevBest === null ? timeMs : Math.min(prevBest, timeMs);

  await setDoc(userRef, {
    uid: currentUser.uid,
    email: currentUser.email,
    nickname: profile.nickname,
    bestTimeMs: newBest,
    lastTimeMs: timeMs,
    updatedAt: serverTimestamp(),
    ...(profile?.createdAt ? {} : { createdAt: serverTimestamp() })
  }, { merge: true });

  profile.bestTimeMs = newBest;
  profile.lastTimeMs = timeMs;
  lastResult.textContent = formatMs(timeMs);
  bestResult.textContent = formatMs(newBest);
}

function finishRound(timeMs) {
  phase = 'result';
  clearTimeout(waitTimer);
  gameStage.classList.remove('waiting', 'go');
  gameStage.classList.add('idle');
  stageCopy.innerHTML = `
    <h3>${formatMs(timeMs)}</h3>
    <p>Nice reflex. Tap below to try again.</p>
  `;
  gameButton.textContent = 'Click to try again';
  gameButton.disabled = false;
  void saveResult(timeMs);
}

function tooSoon() {
  clearTimeout(waitTimer);
  phase = 'idle';
  gameStage.classList.remove('go');
  gameStage.classList.add('waiting');
  stageCopy.innerHTML = `
    <h3>Too early</h3>
    <p>Wait for the green screen next time.</p>
  `;
  gameButton.textContent = 'Try again';
  gameButton.disabled = false;
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
        <div>
          <div class="nick">${row.nickname || 'Anonymous'}</div>
          <div class="result-label">Best reflex</div>
        </div>
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
      .map((d) => d.data())
      .filter((item) => typeof item.bestTimeMs === 'number');
    renderLeaderboard(rows);
  }, () => {
    leaderboardList.innerHTML = '<li style="justify-content:center;color:var(--muted);">Leaderboard unavailable right now.</li>';
  });
}

async function routeAfterLogin(user) {
  currentUser = user;
  setStatus(`Signed in as ${user.email}.`);
  logoutFromAuth.classList.remove('hidden');
  const existing = await getOrCreateProfile(user);
  profile = existing;

  if (!existing || !existing.nickname) {
    showSection('nickname');
    nicknameInput.value = existing?.nickname || '';
    profilePill.textContent = user.email;
    return;
  }

  showSection('game');
  welcomeLine.textContent = `Welcome, ${existing.nickname}`;
  profilePill.textContent = `${existing.nickname} · ${user.email}`;
  bestResult.textContent = formatMs(existing.bestTimeMs);
  lastResult.textContent = formatMs(existing.lastTimeMs);
  resetGameStage();
  listenLeaderboard();
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
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
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
    showSection('game');
    welcomeLine.textContent = `Welcome, ${nickname}`;
    profilePill.textContent = `${nickname} · ${currentUser.email}`;
    bestResult.textContent = formatMs(profile?.bestTimeMs);
    lastResult.textContent = formatMs(profile?.lastTimeMs);
    resetGameStage();
    listenLeaderboard();
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Could not save nickname.');
  }
});

gameButton.addEventListener('click', () => {
  if (!currentUser || !profile?.nickname) return;
  if (phase === 'idle' || phase === 'result') {
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

gameStage.addEventListener('click', (e) => {
  if (e.target === gameButton) return;
  gameButton.click();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    profile = null;
    showSection('auth');
    setStatus('Not signed in.');
    logoutFromAuth.classList.add('hidden');
    if (leaderboardUnsub) {
      leaderboardUnsub();
      leaderboardUnsub = null;
    }
    resetGameStage();
    leaderboardList.innerHTML = '';
    leaderNick.textContent = '—';
    leaderTime.textContent = '—';
    welcomeLine.textContent = 'Welcome back';
    profilePill.textContent = '—';
    lastResult.textContent = '—';
    bestResult.textContent = '—';
    return;
  }
  await routeAfterLogin(user);
});

resetGameStage();
