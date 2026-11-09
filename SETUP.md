# RideSafe setup

## What is needed for automatic SMS

Automatic SMS uses Firebase Authentication, a deployed Firebase Cloud Function, and a Twilio account. Firebase Cloud Functions require a Firebase project on the Blaze plan. Twilio trial accounts may only send to verified recipient numbers.

The Firebase web-app values below are app configuration, not Twilio credentials. Never put Twilio credentials in the Expo app, `.env`, or source control.

## Configure Firebase

1. Create a Firebase project and register a **Web app** in the project settings.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. Create a Cloud Firestore database in the Firebase console.
4. Copy the web-app configuration values into a local `.env` file:

   ```powershell
   Copy-Item .env.example .env
   ```

   Replace the example values for `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, and `EXPO_PUBLIC_FIREBASE_APP_ID`. Keep the Functions region as `us-central1` unless the function is intentionally deployed elsewhere.

5. Install the Firebase CLI, sign in, and select the project:

   ```powershell
   npx firebase-tools login
   npx firebase-tools use --add
   ```

## Configure Twilio and deploy

1. Create a Twilio account and obtain an SMS-capable sender number. Use international format (for example, `+14155550123`).
2. From the project root, set each secret when prompted. Do not paste the values into chat or commit them:

   ```powershell
   npx firebase-tools functions:secrets:set TWILIO_ACCOUNT_SID
   npx firebase-tools functions:secrets:set TWILIO_AUTH_TOKEN
   npx firebase-tools functions:secrets:set TWILIO_FROM_NUMBER
   ```

3. Install the function dependencies and deploy:

   ```powershell
   npm install --prefix functions
   npx firebase-tools deploy --only functions,firestore
   ```

4. Restart the Expo development server after creating or changing `.env`:

   ```powershell
   npx expo start
   ```

## Test an alert

1. Sign in or create an account in RideSafe.
2. Add emergency contacts using **Select phone contact**. For automatic SMS, their saved phone numbers must include a country code in E.164 format, such as `+14155550123`.
3. Select up to five recipients, then choose **Start alert test** and confirm.
4. Keep RideSafe open. If the 30-second countdown expires without cancellation, the app calls the Firebase function, which asks Twilio to submit an SMS. Test only with recipients who have agreed to receive a test.

Twilio acceptance is not proof of delivery. A failed automatic send is reported in the app; the SMS composer fallback requires a person to review and tap **Send**. In local demo mode, RideSafe only opens that composer and never sends SMS automatically.

## Current limitations

- The countdown runs in the foreground. It will not continue if the app is stopped or terminated.
- ESP32 Bluetooth scanning and accident-event integration are not implemented yet.
- Automatic sending requires Firebase and Twilio configuration, network access, and valid international-format recipient numbers.
