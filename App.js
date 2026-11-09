
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts';
import { Contact, ContactField } from 'expo-contacts';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  auth,
  firebaseConfigured,
  sendEmergencyAlert,
} from './src/services/firebase';

const COLORS = {
  background: '#0B1220',
  card: '#151F30',
  cardLight: '#1D2A3D',
  primary: '#20C997',
  text: '#F5F7FA',
  muted: '#9AA9BC',
  danger: '#F05252',
  border: '#2B3A50',
};

const CONTACTS_STORAGE_KEY = '@ridesafe/emergency-contacts';
const ALERT_COUNTDOWN_SECONDS = 30;
const CANCEL_UNLOCK_SECONDS = 5;
const MAXIMUM_ALERT_RECIPIENTS = 5;

/**
 * @typedef {{ id: string, name: string, phone: string, selected: boolean }} EmergencyContact
 */

/** @param {unknown} error */
const getErrorCode = error =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'string'
    ? error.code
    : '';

/** @param {unknown} error */
const getErrorMessage = error =>
  error instanceof Error ? error.message : 'An unexpected error occurred.';

/** @param {{ title: string, subtitle?: string }} props */
const Header = ({ title, subtitle }) => (
  <View style={styles.header}>
    <Text style={styles.brand}>RIDESAFE</Text>
    <Text style={styles.heading}>{title}</Text>
    {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  </View>
);

/** @param {{ title: string, onPress: () => void, danger?: boolean, disabled?: boolean }} props */
const PrimaryButton = ({ title, onPress, danger = false, disabled = false }) => (
  <TouchableOpacity
    style={[
      styles.primaryButton,
      danger && styles.dangerButton,
      disabled && styles.disabledButton,
    ]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
  >
    <Text style={styles.primaryButtonText}>{title}</Text>
  </TouchableOpacity>
);

/** @param {{ setScreen: (screen: string) => void, onStartAlert: () => void }} props */
const TabBar = ({ setScreen, onStartAlert }) => (
  <View style={styles.tabBar}>
    <TouchableOpacity style={styles.tab} onPress={() => setScreen('dashboard')}>
      <Text style={styles.tabIcon}>⌂</Text>
      <Text style={styles.tabText}>Home</Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.tab} onPress={() => setScreen('contacts')}>
      <Text style={styles.tabIcon}>♡</Text>
      <Text style={styles.tabText}>Contacts</Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.tab} onPress={onStartAlert}>
      <Text style={styles.tabIcon}>!</Text>
      <Text style={styles.tabText}>Test alert</Text>
    </TouchableOpacity>
  </View>
);

export default function App() {
  const [screen, setScreen] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('signIn');
  const [authLoading, setAuthLoading] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(
    /** @type {import('firebase/auth').User | null} */ (null)
  );
  const [demoMode, setDemoMode] = useState(false);

  const [contacts, setContacts] = useState(
    /** @type {EmergencyContact[]} */ ([])
  );
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [contactsPersistenceEnabled, setContactsPersistenceEnabled] = useState(false);
  const [seconds, setSeconds] = useState(ALERT_COUNTDOWN_SECONDS);
  const [alertStatus, setAlertStatus] = useState('');
  const alertHandledRef = useRef(false);
  const alertEventIdRef = useRef('');
  const demoModeRef = useRef(false);

  useEffect(() => {
    if (!auth) return undefined;

    return onAuthStateChanged(auth, user => {
      setFirebaseUser(user);
      if (user) {
        demoModeRef.current = false;
        setDemoMode(false);
        setScreen('dashboard');
      } else if (!demoModeRef.current) {
        setScreen('login');
      }
    });
  }, []);

  useEffect(() => {
    let active = true;

    const loadContacts = async () => {
      try {
        const savedContacts = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);
        if (!active) return;

        if (savedContacts) {
          const parsedContacts = JSON.parse(savedContacts);
          if (!Array.isArray(parsedContacts)) {
            throw new Error('Saved emergency contacts are not a list.');
          }

          setContacts(
            parsedContacts.filter(
              contact =>
                contact &&
                typeof contact.id === 'string' &&
                typeof contact.name === 'string' &&
                typeof contact.phone === 'string' &&
                typeof contact.selected === 'boolean'
            )
          );
        }
        setContactsPersistenceEnabled(true);
      } catch (error) {
        console.error('Unable to load emergency contacts:', error);
        setContactsPersistenceEnabled(false);
        Alert.alert(
          'Contacts could not be loaded',
          'Saved emergency contacts could not be read. You can still add contacts during this session.'
        );
      } finally {
        if (active) setContactsLoaded(true);
      }
    };

    loadContacts();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!contactsLoaded || !contactsPersistenceEnabled) return;

    AsyncStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts)).catch(error => {
      console.error('Unable to save emergency contacts:', error);
      setContactsPersistenceEnabled(false);
      Alert.alert(
        'Contacts could not be saved',
        'RideSafe could not save your emergency contacts on this device.'
      );
    });
  }, [contacts, contactsLoaded, contactsPersistenceEnabled]);

  useEffect(() => {
    if (screen !== 'warning' || seconds <= 0) return undefined;

    const timer = setTimeout(() => {
      setSeconds(value => value - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [screen, seconds]);

  const login = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing information', 'Please enter your email and password.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (!auth) {
      Alert.alert(
        'Firebase is not configured',
        'Add the Firebase web app values to your local .env file before signing in.'
      );
      return;
    }

    if (authMode === 'signUp' && password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters for your password.');
      return;
    }

    setAuthLoading(true);
    try {
      const result =
        authMode === 'signUp'
          ? await createUserWithEmailAndPassword(auth, email.trim(), password)
          : await signInWithEmailAndPassword(auth, email.trim(), password);
      setFirebaseUser(result.user);
      demoModeRef.current = false;
      setDemoMode(false);
      setScreen('dashboard');
    } catch (error) {
      console.error('Firebase authentication failed:', error);
      /** @type {Record<string, string>} */
      const messages = {
        'auth/email-already-in-use': 'An account already uses this email address.',
        'auth/invalid-credential': 'The email or password is incorrect.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/weak-password': 'Use at least 6 characters for your password.',
        'auth/operation-not-allowed':
          'Enable Email/Password sign-in in your Firebase Authentication settings.',
      };
      const errorCode = getErrorCode(error);
      Alert.alert(
        'Authentication failed',
        messages[errorCode] || getErrorMessage(error)
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const enterLocalDemo = () => {
    demoModeRef.current = true;
    setDemoMode(true);
    setFirebaseUser(null);
    setScreen('dashboard');
  };

  const logOut = async () => {
    if (auth && firebaseUser && !demoMode) {
      try {
        await signOut(auth);
        return;
      } catch (error) {
        console.error('Firebase sign-out failed:', error);
        Alert.alert('Unable to sign out', 'Firebase could not sign you out. Please try again.');
        return;
      }
    }

    demoModeRef.current = false;
    setDemoMode(false);
    setScreen('login');
  };

  const addContactFromPhone = async () => {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Contacts permission needed',
          'Allow RideSafe to access contacts so you can choose an emergency contact.'
        );
        return;
      }

      const selectedContact = await Contact.presentPicker();
      if (!selectedContact) return;

      const details = await selectedContact.getDetails([
        ContactField.FULL_NAME,
        ContactField.PHONES,
      ]);
      const phone = details.phones?.find(item => item.number?.trim())?.number?.trim();
      const name = details.fullName?.trim();

      if (!phone) {
        Alert.alert(
          'No phone number found',
          'Choose a phone contact that has a saved number.'
        );
        return;
      }

      const contact = {
        id: `${selectedContact.id}:${phone.replace(/[^\d+]/g, '')}`,
        name: name || phone,
        phone,
        selected: true,
      };

      setContacts(current => {
        if (current.some(item => item.id === contact.id)) {
          return current.map(item =>
            item.id === contact.id ? { ...item, selected: true } : item
          );
        }
        return [...current, contact];
      });
    } catch (error) {
      console.error('Unable to select a phone contact:', error);
      Alert.alert(
        'Unable to open contacts',
        'RideSafe could not read that contact. Please try again or check contact permissions.'
      );
    }
  };

  /** @param {string} id */
  const removeContact = id => {
    setContacts(current => current.filter(contact => contact.id !== id));
  };

  /** @param {string} id */
  const toggleContact = id => {
    setContacts(current =>
      current.map(contact =>
        contact.id === id ? { ...contact, selected: !contact.selected } : contact
      )
    );
  };

  const openEmergencyMessage = useCallback(async () => {
    const selectedContacts = contacts.filter(contact => contact.selected);
    if (selectedContacts.length === 0) {
      setAlertStatus('No emergency contacts are selected.');
      Alert.alert(
        'No emergency contacts selected',
        'Add and select at least one emergency contact before starting an alert.'
      );
      return;
    }

    let locationDescription = 'Location unavailable';
    let location = null;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date(position.timestamp).toISOString(),
        };
        const mapsUrl = `https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`;
        locationDescription = `${mapsUrl}\nLocation recorded: ${new Date(
          position.timestamp
        ).toLocaleString()}`;
      } else {
        locationDescription = 'Location unavailable (location permission not granted)';
      }
    } catch (error) {
      console.error('Unable to get the current location:', error);
      try {
        const lastPosition = await Location.getLastKnownPositionAsync();
        if (lastPosition) {
          location = {
            latitude: lastPosition.coords.latitude,
            longitude: lastPosition.coords.longitude,
            timestamp: new Date(lastPosition.timestamp).toISOString(),
          };
          const mapsUrl = `https://maps.google.com/?q=${lastPosition.coords.latitude},${lastPosition.coords.longitude}`;
          locationDescription = `${mapsUrl}\nLast known location recorded: ${new Date(
            lastPosition.timestamp
          ).toLocaleString()}`;
        } else {
          locationDescription = 'Location unavailable (current and last known locations could not be obtained)';
        }
      } catch (lastLocationError) {
        console.error('Unable to get the last known location:', lastLocationError);
        locationDescription = 'Location unavailable (location services could not be reached)';
      }
    }

    const message = [
      'EMERGENCY: RideSafe detected a possible two-wheeler accident.',
      'The rider may need assistance.',
      `Location: ${locationDescription}`,
      'Please contact the rider and seek help if needed.',
    ].join('\n\n');

    if (firebaseConfigured && firebaseUser && !demoMode) {
      try {
        const result = await sendEmergencyAlert({
          eventId: alertEventIdRef.current,
          recipients: selectedContacts.map(contact =>
            contact.phone.replace(/[\s()-]/g, '')
          ),
          location,
        });
        if (result.duplicate) {
          setAlertStatus('This alert was already processed and was not sent again.');
          return;
        }

        const acceptedCount = result.acceptedCount || 0;
        const failedCount = result.failedCount || 0;
        setAlertStatus(
          `${acceptedCount} of ${result.recipientCount} SMS requests were accepted by Twilio; delivery is not confirmed.`
        );
        Alert.alert(
          failedCount > 0 ? 'Some alerts were not accepted' : 'Alert submitted',
          `${acceptedCount} of ${result.recipientCount} SMS requests were accepted by Twilio. This does not confirm delivery.`
        );
        return;
      } catch (error) {
        console.error('Automatic emergency alert failed:', error);
        setAlertStatus('Automatic sending failed. You can try the SMS composer instead.');
        Alert.alert(
          'Automatic alert failed',
          getErrorMessage(error),
          [
            { text: 'Close', style: 'cancel' },
            {
              text: 'Open SMS draft',
              onPress: () => {
                SMS.isAvailableAsync()
                  .then(available => {
                    if (!available) {
                      Alert.alert('SMS unavailable', 'No SMS message could be prepared.');
                      return;
                    }
                    return SMS.sendSMSAsync(
                      selectedContacts.map(contact => contact.phone),
                      message
                    );
                  })
                  .catch(smsError => {
                    console.error('Unable to open the SMS fallback:', smsError);
                    Alert.alert('Unable to open SMS', 'No message was sent.');
                  });
              },
            },
          ]
        );
        return;
      }
    }

    try {
      const available = await SMS.isAvailableAsync();
      if (!available) {
        setAlertStatus('SMS is not available on this device.');
        Alert.alert(
          'SMS unavailable',
          'This device cannot open an SMS composer. No message was sent.'
        );
        return;
      }

      const result = await SMS.sendSMSAsync(
        selectedContacts.map(contact => contact.phone),
        message
      );

      if (result.result === 'cancelled') {
        setAlertStatus('The SMS composer was closed without sending.');
        return;
      }

      setAlertStatus('SMS composer opened. Review the message and tap Send to deliver it.');
      Alert.alert(
        'Message ready',
        'RideSafe opened a prefilled SMS. Review it and tap Send in your messaging app. RideSafe cannot send SMS silently or confirm delivery.'
      );
    } catch (error) {
      console.error('Unable to open the SMS composer:', error);
      setAlertStatus('Could not open the SMS composer.');
      Alert.alert(
        'Unable to prepare the message',
        'The SMS composer could not be opened. No message was sent.'
      );
    }
  }, [contacts, demoMode, firebaseUser]);

  const startDemoAccident = () => {
    const selectedContacts = contacts.filter(contact => contact.selected);
    if (selectedContacts.length === 0) {
      Alert.alert(
        'No emergency contacts selected',
        'Add and select at least one emergency contact before testing the alert.'
      );
      setScreen('contacts');
      return;
    }

    if (selectedContacts.length > MAXIMUM_ALERT_RECIPIENTS) {
      Alert.alert(
        'Too many emergency contacts',
        `Select no more than ${MAXIMUM_ALERT_RECIPIENTS} contacts for one alert.`
      );
      setScreen('contacts');
      return;
    }

    if (
      firebaseConfigured &&
      firebaseUser &&
      !demoMode &&
      selectedContacts.some(contact => !/^\+[1-9]\d{7,14}$/.test(contact.phone.replace(/[\s()-]/g, '')))
    ) {
      Alert.alert(
        'Phone number format needed',
        'Automatic SMS requires contacts saved with an international number, such as +14155550123. Update the number in your phone contacts and select it again.'
      );
      return;
    }

    Alert.alert(
      'Start 30-second alert test?',
      firebaseConfigured && firebaseUser && !demoMode
        ? 'If you do not cancel, RideSafe will send a real SMS to the selected contacts. Carrier and Twilio charges may apply.'
        : 'If you do not cancel, RideSafe will open a prefilled SMS draft. You must review and tap Send.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start countdown',
          style: 'destructive',
          onPress: () => {
            alertHandledRef.current = false;
            alertEventIdRef.current = `${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`;
            setAlertStatus('');
            setSeconds(ALERT_COUNTDOWN_SECONDS);
            setScreen('warning');
          },
        },
      ]
    );
  };

  const stopDemoAccident = () => {
    if (
      seconds === 0 ||
      seconds > ALERT_COUNTDOWN_SECONDS - CANCEL_UNLOCK_SECONDS
    ) {
      return;
    }
    alertHandledRef.current = true;
    setScreen('dashboard');
    Alert.alert('Alert cancelled', 'The countdown was cancelled. No message was prepared.');
  };

  useEffect(() => {
    if (screen !== 'warning' || seconds !== 0 || alertHandledRef.current) return;

    alertHandledRef.current = true;
    setAlertStatus('Preparing your emergency message…');
    openEmergencyMessage();
  }, [openEmergencyMessage, screen, seconds]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {screen === 'login' && (
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>⌁</Text>
          </View>

          <Text style={styles.brand}>RIDESAFE</Text>
          <Text style={styles.loginTitle}>Your safety, our priority.</Text>
          <Text style={styles.subtitle}>
            Smart two-wheeler accident detection and emergency assistance.
          </Text>

          <View style={styles.formCard}>
            {firebaseConfigured ? (
              <>
                <Text style={styles.sectionTitle}>
                  {authMode === 'signUp' ? 'Create your account' : 'Welcome back'}
                </Text>
                <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                />

                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <TextInput
                  style={styles.input}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.muted}
                  secureTextEntry
                  autoComplete={authMode === 'signUp' ? 'new-password' : 'current-password'}
                  value={password}
                  onChangeText={setPassword}
                />

                <PrimaryButton
                  title={authMode === 'signUp' ? 'CREATE ACCOUNT' : 'SIGN IN'}
                  onPress={login}
                  disabled={authLoading}
                />
                <TouchableOpacity
                  style={styles.logoutButton}
                  onPress={() =>
                    setAuthMode(mode => (mode === 'signIn' ? 'signUp' : 'signIn'))
                  }
                  disabled={authLoading}
                >
                  <Text style={styles.logoutText}>
                    {authMode === 'signUp'
                      ? 'Already have an account? Sign in'
                      : 'New to RideSafe? Create an account'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Firebase setup needed</Text>
                <Text style={styles.mutedText}>
                  Add your Firebase web app settings to the local .env file to enable accounts and automatic alert delivery. The demo does not sign in or send SMS automatically.
                </Text>
              </>
            )}
            <PrimaryButton
              title={firebaseConfigured ? 'OPEN LOCAL DEMO' : 'CONTINUE IN LOCAL DEMO'}
              onPress={enterLocalDemo}
            />
          </View>
        </ScrollView>
      )}

      {screen === 'dashboard' && (
        <>
          <ScrollView contentContainerStyle={styles.page}>
            <Header title="Dashboard" subtitle="Your ride safety overview" />

            <View style={styles.statusCard}>
              <View style={styles.statusTop}>
                <View>
                  <Text style={styles.cardLabel}>SYSTEM STATUS</Text>
                  <Text style={styles.statusTitle}>
                    {demoMode ? 'Local demo mode' : 'Firebase account active'}
                  </Text>
                </View>
                <View style={styles.statusDot} />
              </View>
              <Text style={styles.mutedText}>
                Hardware connection has not been configured yet.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Safety overview</Text>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statIcon}>♡</Text>
                <Text style={styles.statNumber}>{contacts.length}</Text>
                <Text style={styles.statLabel}>Emergency contacts</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statIcon}>⌁</Text>
                <Text style={styles.statNumber}>OFFLINE</Text>
                <Text style={styles.statLabel}>Device connection</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.cardLabel}>EMERGENCY PROTECTION</Text>
              <Text style={styles.infoTitle}>Stay prepared</Text>
              <Text style={styles.mutedText}>
                Add trusted people who can be contacted in an emergency.
              </Text>
              <PrimaryButton
                title="MANAGE CONTACTS  →"
                onPress={() => setScreen('contacts')}
              />
            </View>

            <View style={styles.demoCard}>
              <Text style={styles.cardLabel}>ALERT FLOW TEST</Text>
              <Text style={styles.infoTitle}>Accident warning screen</Text>
              <Text style={styles.mutedText}>
                Test the 30-second countdown. A signed-in, configured account sends through the secured service after expiry; local demo mode opens an SMS draft for you to review.
              </Text>
              <PrimaryButton
                title="START ALERT TEST"
                onPress={startDemoAccident}
                danger
              />
            </View>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={logOut}
            >
              <Text style={styles.logoutText}>
                {demoMode ? 'Exit local demo' : 'Sign out'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
          <TabBar setScreen={setScreen} onStartAlert={startDemoAccident} />
        </>
      )}

      {screen === 'contacts' && (
        <>
          <ScrollView contentContainerStyle={styles.page}>
            <Header
              title="Emergency contacts"
              subtitle="People to reach in an emergency"
            />

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Choose from your phone</Text>
              <Text style={styles.mutedText}>
                Pick a saved contact and number. RideSafe stores the selected number on this device. Choose up to five contacts for one alert.
              </Text>
              <PrimaryButton
                title="+ SELECT PHONE CONTACT"
                onPress={addContactFromPhone}
              />
            </View>

            <Text style={styles.sectionTitle}>Saved contacts ({contacts.length})</Text>

            {contacts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>♡</Text>
                <Text style={styles.infoTitle}>No contacts added</Text>
                <Text style={styles.mutedText}>
                  Add at least one trusted contact to prepare for emergencies.
                </Text>
              </View>
            ) : (
              contacts.map(contact => (
                <View style={styles.contactCard} key={contact.id}>
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactAvatarText}>
                      {contact.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.contactDetails}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.mutedText}>{contact.phone}</Text>
                    <TouchableOpacity onPress={() => toggleContact(contact.id)}>
                      <Text style={contact.selected ? styles.selectedText : styles.removeText}>
                        {contact.selected ? 'Selected for alerts' : 'Tap to include in alerts'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => removeContact(contact.id)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <Text style={styles.helperText}>
              Contacts are saved privately on this device. Choose which contacts should receive alerts.
            </Text>
          </ScrollView>
          <TabBar setScreen={setScreen} onStartAlert={startDemoAccident} />
        </>
      )}

      {screen === 'warning' && (
        <ScrollView contentContainerStyle={styles.warningContainer}>
          <View style={styles.warningCircle}>
            <Text style={styles.warningIcon}>!</Text>
          </View>

          <Text style={styles.warningLabel}>ACCIDENT WARNING</Text>
          <Text style={styles.warningTitle}>Are you okay?</Text>
          <Text style={styles.warningDescription}>
            A possible accident has been detected. Please confirm that you are safe.
          </Text>

          <View style={styles.timerCard}>
            <Text style={styles.cardLabel}>ALERT COUNTDOWN</Text>
            <Text style={styles.timerNumber}>{seconds}</Text>
            <Text style={styles.mutedText}>seconds remaining</Text>
          </View>

          <Text style={styles.warningHint}>
            Cancel becomes available after 5 seconds. If the countdown expires, RideSafe sends via the configured service or opens an SMS draft in local demo mode. Keep the app open; this timer does not continue if the app is stopped.
          </Text>

          <PrimaryButton
            title="I AM SAFE — CANCEL ALERT"
            onPress={stopDemoAccident}
            disabled={
              seconds === 0 ||
              seconds > ALERT_COUNTDOWN_SECONDS - CANCEL_UNLOCK_SECONDS
            }
          />

          {seconds === 0 && (
            <Text style={styles.demoFinished}>
              {alertStatus || 'Countdown complete.'}
            </Text>
          )}

          {seconds === 0 && (
            <TouchableOpacity onPress={() => setScreen('dashboard')}>
              <Text style={styles.backText}>Return to dashboard</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  page: {
    padding: 22,
    paddingBottom: 35,
  },
  loginContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 26,
  },
  brand: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 12,
  },
  heading: {
    color: COLORS.text,
    fontSize: 29,
    fontWeight: '800',
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  logoCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: COLORS.cardLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 22,
  },
  logoIcon: {
    color: COLORS.primary,
    fontSize: 46,
    fontWeight: 'bold',
  },
  loginTitle: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    marginTop: 25,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 16,
  },
  fieldLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 13,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  dangerButton: {
    backgroundColor: COLORS.danger,
  },
  disabledButton: {
    backgroundColor: '#465367',
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#07151A',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 15,
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 19,
    marginBottom: 26,
  },
  statusTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 9,
  },
  statusTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  statusDot: {
    height: 12,
    width: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  mutedText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 23,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon: {
    color: COLORS.primary,
    fontSize: 23,
    marginBottom: 12,
  },
  statNumber: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '900',
  },
  statLabel: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 5,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 19,
    marginBottom: 16,
  },
  infoTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  demoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 19,
  },
  logoutButton: {
    alignItems: 'center',
    padding: 20,
  },
  logoutText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 12,
    paddingBottom: 15,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  tabIcon: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  tabText: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: 'center',
  },
  emptyIcon: {
    color: COLORS.primary,
    fontSize: 35,
    marginBottom: 12,
  },
  contactCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  contactDetails: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 4,
  },
  removeText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  selectedText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  warningContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  warningCircle: {
    height: 92,
    width: 92,
    borderRadius: 46,
    backgroundColor: '#44252C',
    borderWidth: 2,
    borderColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  warningIcon: {
    color: COLORS.danger,
    fontSize: 54,
    fontWeight: '900',
  },
  warningLabel: {
    color: COLORS.danger,
    fontWeight: '900',
    letterSpacing: 2,
    fontSize: 12,
  },
  warningTitle: {
    color: COLORS.text,
    fontSize: 31,
    fontWeight: '900',
    marginTop: 12,
  },
  warningDescription: {
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 12,
    marginBottom: 25,
  },
  timerCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 22,
    alignItems: 'center',
  },
  timerNumber: {
    color: COLORS.text,
    fontSize: 55,
    fontWeight: '900',
    marginVertical: 5,
  },
  warningHint: {
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 12,
    marginTop: 20,
  },
  demoFinished: {
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 20,
  },
  backText: {
    color: COLORS.muted,
    marginTop: 25,
    padding: 12,
  },
});
