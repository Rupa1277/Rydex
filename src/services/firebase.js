import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  // @ts-expect-error Firebase's root declaration omits this React Native conditional export.
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Platform } from 'react-native';

/**
 * @typedef {{
 *   eventId: string,
 *   recipients: string[],
 *   location: { latitude: number, longitude: number, timestamp: string } | null
 * }} EmergencyAlertRequest
 */

/**
 * @typedef {{
 *   status: string,
 *   recipientCount: number,
 *   acceptedCount?: number,
 *   failedCount?: number,
 *   duplicate: boolean
 * }} EmergencyAlertResponse
 */

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(
  value => typeof value === 'string' && value.length > 0
);

/** @type {import('firebase/auth').Auth | null} */
let auth = null;
/** @type {import('firebase/functions').Functions | null} */
let functions = null;

if (firebaseConfigured) {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  try {
    auth = initializeAuth(app, {
      persistence:
        Platform.OS === 'web'
          ? browserLocalPersistence
          : getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'auth/already-initialized'
    ) {
      throw error;
    }

    auth = getAuth(app);
  }

  const region = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1';
  functions = getFunctions(app, region);
}

export { auth };

/**
 * @param {EmergencyAlertRequest} payload
 * @returns {Promise<EmergencyAlertResponse>}
 */
export async function sendEmergencyAlert(payload) {
  if (!functions) {
    throw new Error('Firebase Cloud Functions are not configured.');
  }

  /** @type {import('firebase/functions').HttpsCallable<EmergencyAlertRequest, EmergencyAlertResponse>} */
  const sendAlert = httpsCallable(functions, 'sendEmergencyAlert', {
    timeout: 60000,
  });
  const result = await sendAlert(payload);
  return result.data;
}
