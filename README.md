# Rash Reflex

A clean reaction-time website built with HTML, CSS, JavaScript, Firebase Authentication, and Cloud Firestore.

## What it does
- Email/password login
- Optional Google sign-in
- One nickname saved per account
- Random red-to-green reaction test
- Millisecond time display
- Leaderboard showing the best times, with one entry per player

## Files
- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`

## Firebase setup
1. Create a Firebase project.
2. Enable **Authentication**.
   - Turn on **Email/Password**.
   - Turn on **Google** if you want the Google button.
3. Create a **Cloud Firestore** database.
4. Replace the values in `firebase-config.js` with your Firebase web app config.
5. Deploy the folder on GitHub Pages, Firebase Hosting, or any static host.

## Firestore data model
Collection: `users`

Document ID: the user's Firebase Auth `uid`

Fields:
- `uid`
- `email`
- `nickname`
- `bestTimeMs`
- `lastTimeMs`
- `createdAt`
- `updatedAt`

This keeps one nickname and one leaderboard row per player.

## Simple security idea
Use Firestore rules so users can only write their own `users/{uid}` document.
