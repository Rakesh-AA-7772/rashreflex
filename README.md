# Rash Reflex

## Setup
1. Put your Firebase web config into `firebase-config.js`.
2. Enable Authentication providers:
   - Email / Password
   - Google
3. Add your local and deployed domains in:
   Authentication → Settings → Authorized domains
4. Deploy with your preferred host.

## Firestore structure
- `users/{uid}` for profile data
- `leaderboard/{uid}` for best reaction times
