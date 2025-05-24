# Firebase Deployment Guide

This guide explains how to deploy your PDF sharing app to Firebase with proper environment variable configuration.

## Prerequisites

1. Firebase CLI installed and logged in
2. Firebase project created (`pdf-culture`)
3. Environment variables configured in Firebase Functions config

## Environment Variables Setup

All environment variables have been configured using Firebase Functions config. Here's what was set up:

### Firebase Client Configuration (Public)

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

### Email Configuration

- `EMAIL_USER`
- `EMAIL_APP_PASSWORD`

### Firebase Admin Configuration (Server-side)

- `FIREBASE_PRIVATE_KEY_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_CLIENT_ID`
- `FIREBASE_AUTH_URI`
- `FIREBASE_TOKEN_URI`
- `FIREBASE_AUTH_PROVIDER_X509_CERT_URL`
- `FIREBASE_CERT_URL`

### Redis Configuration

- `REDIS_URL`

## Deployment Commands

### Option 1: Automated Deployment (Recommended)

```bash
npm run deploy:firebase
```

This command will:

1. Set up environment variables from Firebase config
2. Deploy to Firebase automatically

### Option 2: Manual Steps

```bash
# 1. Set up environment variables
node scripts/setup-firebase-env.js

# 2. Deploy to Firebase
firebase deploy
```

### Option 3: Build Only (for testing)

```bash
npm run build:firebase
```

## Viewing Environment Variables

To see all configured environment variables:

```bash
firebase functions:config:get
```

## Updating Environment Variables

To update any environment variable, use the Firebase CLI:

```bash
# Example: Update email user
firebase functions:config:set email.user="newemail@gmail.com"

# Example: Update Firebase API key
firebase functions:config:set next_public.firebase_api_key="new-api-key"
```

After updating, redeploy:

```bash
npm run deploy:firebase
```

## Troubleshooting

### Environment Variables Not Loading

1. Ensure you're on the `firebase` branch
2. Run `firebase functions:config:get` to verify variables are set
3. Run `node scripts/setup-firebase-env.js` to regenerate `.env.production`

### Build Failures

1. Check that all required environment variables are set
2. Verify Firebase CLI is logged in: `firebase login`
3. Ensure you're in the correct Firebase project: `firebase use pdf-culture`

### Deployment Errors

1. Check Firebase project permissions
2. Verify billing is enabled for Firebase project
3. Check Firebase hosting quota

## Branch Strategy

- `main` branch → Netlify deployment
- `firebase` branch → Firebase deployment

Make sure you're on the `firebase` branch when deploying to Firebase.

## Files Created/Modified for Firebase Deployment

- `scripts/setup-firebase-env.js` - Sets up environment variables from Firebase config
- `scripts/deploy-firebase.js` - Automated deployment script
- `next.config.ts` - Updated with environment variable mapping
- `package.json` - Added Firebase-specific build and deploy scripts
- `.env.production` - Generated automatically during deployment

## Security Notes

- Environment variables are stored securely in Firebase Functions config
- Private keys and sensitive data are not exposed in the client bundle
- All `NEXT_PUBLIC_*` variables are safe to expose to the client
- Server-side variables (Firebase admin, Redis, email) remain secure
