const admin = require('firebase-admin');
const twilio = require('twilio');
const { defineSecret } = require('firebase-functions/params');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');

admin.initializeApp();

const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
const twilioFromNumber = defineSecret('TWILIO_FROM_NUMBER');
const maximumRecipients = 5;
const maximumAlertsPerDay = 3;
const rateWindowMilliseconds = 24 * 60 * 60 * 1000;

function validateLocation(location) {
  if (location == null) return null;

  const { latitude, longitude, timestamp } = location;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof timestamp !== 'string' ||
    !Number.isFinite(Date.parse(timestamp))
  ) {
    throw new HttpsError('invalid-argument', 'The location data is invalid.');
  }

  return { latitude, longitude, timestamp };
}

function buildMessage(location) {
  let locationText = 'Location unavailable.';
  if (location) {
    const mapUrl = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
    locationText = `Location: ${mapUrl}\nLocation recorded at: ${new Date(
      location.timestamp
    ).toISOString()}`;
  }

  return [
    'EMERGENCY: RideSafe detected a possible two-wheeler accident.',
    'The rider may need assistance.',
    locationText,
    'Please contact the rider and seek help if needed.',
  ].join('\n\n');
}

exports.sendEmergencyAlert = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    maxInstances: 2,
    secrets: [twilioAccountSid, twilioAuthToken, twilioFromNumber],
  },
  async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before sending an alert.');
    }

    const { eventId, recipients, location: rawLocation } = request.data || {};
    if (
      typeof eventId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(eventId) ||
      !Array.isArray(recipients) ||
      recipients.length < 1 ||
      recipients.length > maximumRecipients ||
      recipients.some(number => typeof number !== 'string' || !/^\+[1-9]\d{7,14}$/.test(number)) ||
      new Set(recipients).size !== recipients.length
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Provide an event ID and 1–5 unique phone numbers in international format.'
      );
    }

    const location = validateLocation(rawLocation);
    let client;
    let fromNumber;
    try {
      const accountSid = twilioAccountSid.value();
      const authToken = twilioAuthToken.value();
      fromNumber = twilioFromNumber.value();
      if (!/^\+[1-9]\d{7,14}$/.test(fromNumber)) {
        throw new Error('Invalid Twilio sender number.');
      }
      client = twilio(accountSid, authToken);
    } catch (error) {
      logger.error('Twilio is not configured for emergency alerts.', {
        errorCode: error.code || 'configuration-error',
      });
      throw new HttpsError(
        'failed-precondition',
        'The SMS provider is not configured on the server.'
      );
    }

    const uid = request.auth.uid;
    const db = admin.firestore();
    const eventRef = db.collection('users').doc(uid).collection('emergencyAlerts').doc(eventId);
    const usageRef = db.collection('emergencyAlertUsage').doc(uid);

    const reservation = await db.runTransaction(async transaction => {
      const eventSnapshot = await transaction.get(eventRef);
      if (eventSnapshot.exists) {
        return { duplicate: true, status: eventSnapshot.data().status };
      }

      const usageSnapshot = await transaction.get(usageRef);
      const now = Date.now();
      const usage = usageSnapshot.exists ? usageSnapshot.data() : {};
      const windowStart = Number.isFinite(usage.windowStart)
        ? usage.windowStart
        : now;
      const withinWindow = now - windowStart < rateWindowMilliseconds;
      const count = withinWindow ? usage.count || 0 : 0;

      if (count >= maximumAlertsPerDay) {
        throw new HttpsError(
          'resource-exhausted',
          'The daily emergency alert limit has been reached.'
        );
      }

      transaction.create(eventRef, {
        status: 'pending',
        recipientCount: recipients.length,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(usageRef, {
        windowStart: withinWindow ? windowStart : now,
        count: count + 1,
      });

      return { duplicate: false };
    });

    if (reservation.duplicate) {
      if (reservation.status === 'submitted' || reservation.status === 'partial') {
        return {
          status: reservation.status,
          duplicate: true,
          recipientCount: recipients.length,
        };
      }
      throw new HttpsError(
        'already-exists',
        'This alert was already processed and will not be sent a second time.'
      );
    }

    const body = buildMessage(location);
    const results = [];

    for (const recipient of recipients) {
      try {
        const message = await client.messages.create({
          to: recipient,
          from: fromNumber,
          body,
        });
        results.push({
          lastFour: recipient.slice(-4),
          status: 'accepted',
          providerStatus: message.status,
          messageSid: message.sid,
        });
      } catch (error) {
        logger.error('Twilio did not accept an emergency SMS.', {
          uid,
          errorCode: error.code || 'unknown',
        });
        results.push({
          lastFour: recipient.slice(-4),
          status: 'failed',
          errorCode: error.code || 'unknown',
        });
      }
    }

    const acceptedCount = results.filter(result => result.status === 'accepted').length;
    const status =
      acceptedCount === recipients.length
        ? 'submitted'
        : acceptedCount > 0
          ? 'partial'
          : 'failed';

    await eventRef.update({
      status,
      results,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (acceptedCount === 0) {
      throw new HttpsError('unavailable', 'The SMS provider did not accept the alert.');
    }

    return {
      status,
      recipientCount: recipients.length,
      acceptedCount,
      failedCount: recipients.length - acceptedCount,
      duplicate: false,
    };
  }
);
