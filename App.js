
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
import { LinearGradient } from 'expo-linear-gradient';
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
  background: '#080A10',
  card: '#12151D',
  cardLight: '#1A1F29',
  primary: '#19D4DC',
  purple: '#A944FF',
  text: '#F6F7FB',
  muted: '#969BA8',
  danger: '#FF4D2E',
  border: '#262B36',
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
    <View style={styles.headerBrandRow}>
      <LinearGradient
        colors={[COLORS.primary, '#5578FF', COLORS.purple]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.brandMark}
      >
        <Text style={styles.brandMarkText}>R</Text>
      </LinearGradient>
      <Text style={styles.brand}>RIDESAFE</Text>
    </View>
    <Text style={styles.heading}>{title}</Text>
    {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  </View>
);

/** @param {{ title: string, onPress: () => void, danger?: boolean, disabled?: boolean }} props */
const PrimaryButton = ({ title, onPress, danger = false, disabled = false }) => (
  <TouchableOpacity
    style={[styles.primaryButton, disabled && styles.disabledButton]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    accessibilityRole="button"
  >
    <LinearGradient
      colors={
        disabled
          ? ['#343944', '#343944']
          : danger
            ? ['#FF6338', '#F22656']
            : ['#347DFF', '#A63FFF']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.primaryButtonGradient}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </LinearGradient>
  </TouchableOpacity>
);

/** @param {{ setScreen: (screen: string) => void, onStartAlert: () => void, screen: string }} props */
const TabBar = ({ setScreen, onStartAlert, screen }) => (
  <View style={styles.tabBar}>
    <TouchableOpacity
      style={styles.tab}
      onPress={() => setScreen('dashboard')}
      accessibilityRole="button"
      accessibilityState={{ selected: screen === 'dashboard' }}
    >
      <Text style={[styles.tabIcon, screen === 'dashboard' && styles.tabIconActive]}>⌂</Text>
      <Text style={[styles.tabText, screen === 'dashboard' && styles.tabTextActive]}>Home</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.tab}
      onPress={() => setScreen('contacts')}
      accessibilityRole="button"
      accessibilityState={{ selected: screen === 'contacts' }}
    >
      <Text style={[styles.tabIcon, screen === 'contacts' && styles.tabIconActive]}>♡</Text>
      <Text style={[styles.tabText, screen === 'contacts' && styles.tabTextActive]}>Contacts</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.tab}
      onPress={onStartAlert}
      accessibilityRole="button"
    >
      <Text style={[styles.tabIcon, styles.tabAlertIcon]}>!</Text>
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
        <View style={styles.loginScreen}>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(115, 44, 190, 0.30)', 'rgba(25, 212, 220, 0.05)', 'transparent']}
            start={{ x: 0.1, y: 1 }}
            end={{ x: 0.9, y: 0 }}
            style={styles.loginGlow}
          />
          <ScrollView contentContainerStyle={styles.loginContainer}>
            <View style={styles.loginBrandRow}>
              <LinearGradient
                colors={[COLORS.primary, '#5578FF', COLORS.purple]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.loginLogo}
              >
                <Text style={styles.loginLogoText}>R</Text>
              </LinearGradient>
              <Text style={styles.brand}>RIDESAFE</Text>
            </View>

            <Text style={styles.loginTitle}>
              {firebaseConfigured && authMode === 'signUp' ? 'Create your\naccount.' : 'Welcome\nback.'}
            </Text>
            <Text style={styles.loginSubtitle}>
              Your ride safety, connected to the people who matter.
            </Text>

            <View style={styles.formCard}>
            {firebaseConfigured ? (
              <>
                <Text style={styles.formIntro}>
                  {authMode === 'signUp' ? 'Get started with RideSafe' : 'Sign in to continue'}
                </Text>
                <Text style={styles.fieldLabel}>EMAIL</Text>
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
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.muted}
                  secureTextEntry
                  autoComplete={authMode === 'signUp' ? 'new-password' : 'current-password'}
                  value={password}
                  onChangeText={setPassword}
                />

                <PrimaryButton
                  title={authLoading ? 'PLEASE WAIT…' : authMode === 'signUp' ? 'CREATE ACCOUNT' : 'LOGIN'}
                  onPress={login}
                  disabled={authLoading}
                />
                <TouchableOpacity
                  style={styles.authSwitch}
                  onPress={() =>
                    setAuthMode(mode => (mode === 'signIn' ? 'signUp' : 'signIn'))
                  }
                  disabled={authLoading}
                >
                  <Text style={styles.authSwitchText}>
                    {authMode === 'signUp'
                      ? 'Already have an account?  Sign in'
                      : 'New to RideSafe?  Create account'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.setupIcon}>
                  <Text style={styles.setupIconText}>✓</Text>
                </View>
                <Text style={styles.formIntro}>A safer ride starts here</Text>
                <Text style={styles.mutedText}>
                  Sign-in and automatic alerts become available after Firebase is configured. Explore the current screens in local demo mode.
                </Text>
              </>
            )}
            <PrimaryButton
              title={firebaseConfigured ? 'EXPLORE DEMO' : 'CONTINUE IN DEMO'}
              onPress={enterLocalDemo}
            />
          </View>
            <Text style={styles.loginFooter}>YOUR RIDE. YOUR PEOPLE. YOUR SAFETY.</Text>
          </ScrollView>
        </View>
      )}

      {screen === 'dashboard' && (
        <>
          <ScrollView contentContainerStyle={styles.page}>
            <View style={styles.dashboardHeader}>
              <Header
                title="Ride with confidence."
                subtitle={demoMode ? 'Local demo mode' : 'Your ride safety overview'}
              />
              <TouchableOpacity
                style={styles.profileButton}
                onPress={logOut}
                accessibilityRole="button"
                accessibilityLabel={demoMode ? 'Exit demo' : 'Sign out'}
              >
                <Text style={styles.profileInitial}>{demoMode ? 'D' : 'R'}</Text>
              </TouchableOpacity>
            </View>

            <LinearGradient
              colors={['#123842', '#182142', '#28153B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.rideHero}
            >
              <View style={styles.rideHeroCopy}>
                <Text style={styles.cardLabel}>RIDE STATUS</Text>
                <Text style={styles.rideHeroTitle}>Your safety,{"\n"}at a glance.</Text>
                <View style={styles.deviceStatusPill}>
                  <View style={styles.offlineDot} />
                  <Text style={styles.deviceStatusText}>DEVICE NOT CONNECTED</Text>
                </View>
                <Text style={styles.rideHeroNote}>
                  Hardware connection is not available in this build.
                </Text>
              </View>
              <View style={styles.rideArt}>
                <View style={styles.rideArtRing} />
                <Text style={styles.rideArtGlyph}>⌁</Text>
                <Text style={styles.rideArtLabel}>RIDE{"\n"}SAFE</Text>
              </View>
            </LinearGradient>

            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionTitle}>Your safety setup</Text>
              <Text style={styles.sectionHint}>ON THIS DEVICE</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, styles.statIconTeal]}>
                  <Text style={styles.statIcon}>♡</Text>
                </View>
                <Text style={styles.statNumber}>{contacts.length}</Text>
                <Text style={styles.statLabel}>Saved contacts</Text>
                <Text style={styles.statFootnote}>
                  {contacts.filter(contact => contact.selected).length} selected
                </Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, styles.statIconPurple]}>
                  <Text style={styles.statIcon}>⌖</Text>
                </View>
                <Text style={styles.statNumber}>30 sec</Text>
                <Text style={styles.statLabel}>Alert countdown</Text>
                <Text style={styles.statFootnote}>Cancel available after 5 sec</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.contactsOverview}
              onPress={() => setScreen('contacts')}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <View style={styles.contactsOverviewIcon}>
                <Text style={styles.contactsOverviewGlyph}>♡</Text>
              </View>
              <View style={styles.contactsOverviewCopy}>
                <Text style={styles.infoTitle}>Emergency contacts</Text>
                <Text style={styles.mutedText}>
                  {contacts.length
                    ? `${contacts.filter(contact => contact.selected).length} selected to receive alerts`
                    : 'Add trusted people to your safety circle'}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.alertTestCard}>
              <View style={styles.alertTestTop}>
                <View style={styles.alertTestIcon}>
                  <Text style={styles.alertTestIconText}>!</Text>
                </View>
                <View style={styles.alertTestCopy}>
                  <Text style={styles.cardLabel}>ALERT FLOW TEST</Text>
                  <Text style={styles.infoTitle}>Try the SOS countdown</Text>
                </View>
              </View>
              <Text style={styles.mutedText}>
                Review the 30-second warning flow. Demo mode opens an SMS draft; automatic sending needs Firebase and Twilio setup.
              </Text>
              <PrimaryButton
                title="START ALERT TEST"
                onPress={startDemoAccident}
                danger
              />
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={logOut}>
              <Text style={styles.logoutText}>
                {demoMode ? 'Exit local demo' : 'Sign out'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
          <TabBar setScreen={setScreen} onStartAlert={startDemoAccident} screen={screen} />
        </>
      )}

      {screen === 'contacts' && (
        <>
          <ScrollView contentContainerStyle={styles.page}>
            <Header
              title="Emergency contacts"
              subtitle="Your trusted circle, ready when needed."
            />

            <View style={styles.contactPickerCard}>
              <View style={styles.contactPickerIcon}>
                <Text style={styles.contactPickerGlyph}>＋</Text>
              </View>
              <Text style={styles.infoTitle}>Add someone you trust</Text>
              <Text style={styles.mutedText}>
                Choose a name and number directly from your phone contacts.
              </Text>
              <PrimaryButton
                title="CHOOSE FROM PHONE"
                onPress={addContactFromPhone}
              />
            </View>

            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionTitle}>Your safety circle</Text>
              <Text style={styles.sectionHint}>{contacts.length} SAVED</Text>
            </View>

            {contacts.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Text style={styles.emptyIcon}>♡</Text>
                </View>
                <Text style={styles.infoTitle}>Your circle starts here</Text>
                <Text style={styles.mutedText}>
                  Add at least one trusted contact to prepare for an alert.
                </Text>
              </View>
            ) : (
              contacts.map(contact => (
                <View
                  style={[
                    styles.contactCard,
                    contact.selected && styles.contactCardSelected,
                  ]}
                  key={contact.id}
                >
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactAvatarText}>
                      {contact.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.contactDetails}
                    onPress={() => toggleContact(contact.id)}
                    activeOpacity={0.75}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: contact.selected }}
                    accessibilityLabel={`${contact.name}, ${contact.selected ? 'selected for alerts' : 'not selected for alerts'}`}
                  >
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactPhone}>{contact.phone}</Text>
                    <Text style={contact.selected ? styles.selectedText : styles.unselectedText}>
                      {contact.selected ? 'IN YOUR ALERT CIRCLE' : 'TAP TO INCLUDE'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectCheck, contact.selected && styles.selectCheckActive]}
                    onPress={() => toggleContact(contact.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: contact.selected }}
                    accessibilityLabel={`Toggle ${contact.name}`}
                  >
                    <Text style={styles.selectCheckText}>{contact.selected ? '✓' : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeContact(contact.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${contact.name}`}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <Text style={styles.helperText}>
              Contacts are saved privately on this device. Choose which contacts should receive alerts.
            </Text>
          </ScrollView>
          <TabBar setScreen={setScreen} onStartAlert={startDemoAccident} screen={screen} />
        </>
      )}

      {screen === 'warning' && (
        <ScrollView contentContainerStyle={styles.warningContainer}>
          <View style={styles.warningHeader}>
            <View style={styles.warningHeaderMark}>
              <Text style={styles.warningHeaderMarkText}>R</Text>
            </View>
            <Text style={styles.warningHeaderBrand}>RIDESAFE</Text>
          </View>
          <Text style={styles.warningLabel}>POSSIBLE ACCIDENT</Text>
          <Text style={styles.warningTitle}>Accident detected!</Text>
          <Text style={styles.warningDescription}>
            If you are safe, cancel the alert before the countdown ends.
          </Text>

          <View style={styles.sosGraphic}>
            <View style={styles.sosOuterRing}>
              <View style={styles.sosMidRing}>
                <LinearGradient
                  colors={['#FF713E', '#FF3D1D']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.sosButton}
                >
                  <Text style={styles.sosText}>SOS</Text>
                  <Text style={styles.sosSubtext}>ALERT IN PROGRESS</Text>
                </LinearGradient>
              </View>
            </View>
          </View>

          <Text style={styles.countdownLabel}>EMERGENCY ALERT IN</Text>
          <Text style={styles.countdownTime}>
            00:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.warningDescription}>
            When the countdown ends, RideSafe will start the configured alert flow.
          </Text>

          <PrimaryButton
            title={
              seconds > ALERT_COUNTDOWN_SECONDS - CANCEL_UNLOCK_SECONDS
                ? `CANCEL AVAILABLE IN ${seconds - (ALERT_COUNTDOWN_SECONDS - CANCEL_UNLOCK_SECONDS)} SEC`
                : 'I AM SAFE — CANCEL ALERT'
            }
            onPress={stopDemoAccident}
            disabled={
              seconds === 0 ||
              seconds > ALERT_COUNTDOWN_SECONDS - CANCEL_UNLOCK_SECONDS
            }
          />

          <Text style={styles.warningHint}>
            Keep RideSafe open. The countdown does not continue if the app is stopped.
          </Text>

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
  loginScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
  loginGlow: {
    position: 'absolute',
    top: -110,
    left: -150,
    width: 430,
    height: 520,
    borderRadius: 260,
  },
  page: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 26,
  },
  loginContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 27,
    paddingVertical: 36,
  },
  loginBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 48,
  },
  loginLogo: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginLogoText: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
  },
  loginSubtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 12,
    maxWidth: 310,
  },
  loginFooter: {
    color: '#666B77',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 32,
  },
  header: {
    flex: 1,
    marginBottom: 22,
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 22,
  },
  brandMark: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
  },
  brand: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 3,
  },
  heading: {
    color: COLORS.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
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
    fontSize: 42,
    lineHeight: 47,
    fontWeight: '900',
    letterSpacing: -1,
  },
  formCard: {
    backgroundColor: 'rgba(17, 19, 27, 0.94)',
    borderRadius: 20,
    padding: 19,
    marginTop: 30,
    borderWidth: 1,
    borderColor: '#242732',
  },
  formIntro: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  setupIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: 'rgba(25, 212, 220, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  setupIconText: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  authSwitch: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    marginTop: 5,
  },
  authSwitchText: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  fieldLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 15,
    marginBottom: 9,
  },
  input: {
    backgroundColor: '#202127',
    color: COLORS.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2B33',
    paddingHorizontal: 15,
    paddingVertical: 15,
    minHeight: 51,
    fontSize: 14,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 11,
    overflow: 'hidden',
    marginTop: 17,
  },
  primaryButtonGradient: {
    minHeight: 49,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  disabledButton: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: COLORS.text,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 18,
    textAlign: 'center',
  },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  profileButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: COLORS.cardLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  profileInitial: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 16,
  },
  rideHero: {
    minHeight: 220,
    borderRadius: 23,
    padding: 20,
    marginBottom: 26,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(92, 207, 220, 0.24)',
  },
  rideHeroCopy: {
    flex: 1,
    zIndex: 1,
  },
  rideHeroTitle: {
    color: COLORS.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    marginBottom: 14,
  },
  deviceStatusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(7, 9, 15, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 99,
  },
  offlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
  },
  deviceStatusText: {
    color: '#E8E9EF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  rideHeroNote: {
    color: '#B5BBC9',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
    maxWidth: 230,
  },
  rideArt: {
    width: 105,
    height: 145,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -7,
  },
  rideArtRing: {
    position: 'absolute',
    width: 105,
    height: 105,
    borderRadius: 53,
    borderWidth: 1,
    borderColor: 'rgba(25, 212, 220, 0.35)',
    backgroundColor: 'rgba(25, 212, 220, 0.09)',
  },
  rideArtGlyph: {
    color: COLORS.primary,
    fontSize: 61,
    fontWeight: '900',
    textShadowColor: 'rgba(25, 212, 220, 0.65)',
    textShadowRadius: 18,
  },
  rideArtLabel: {
    color: '#D5F9FA',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: -7,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
    marginBottom: 14,
  },
  sectionHint: {
    color: '#777D8A',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 14,
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
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
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
    gap: 11,
    marginBottom: 17,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    padding: 15,
    minHeight: 145,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statIconTeal: {
    backgroundColor: 'rgba(25, 212, 220, 0.13)',
  },
  statIconPurple: {
    backgroundColor: 'rgba(169, 68, 255, 0.14)',
  },
  statIcon: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  statNumber: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '900',
  },
  statLabel: {
    color: '#D5D8E0',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  statFootnote: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 5,
  },
  contactsOverview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    minHeight: 80,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 17,
  },
  contactsOverviewIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: 'rgba(25, 212, 220, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactsOverviewGlyph: {
    color: COLORS.primary,
    fontSize: 23,
    fontWeight: '800',
  },
  contactsOverviewCopy: {
    flex: 1,
    marginLeft: 12,
  },
  chevron: {
    color: COLORS.muted,
    fontSize: 27,
    paddingHorizontal: 5,
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
  alertTestCard: {
    backgroundColor: '#17131A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3A2429',
    padding: 17,
    marginBottom: 10,
  },
  alertTestTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  alertTestIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 77, 46, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTestIconText: {
    color: COLORS.danger,
    fontSize: 22,
    fontWeight: '900',
  },
  alertTestCopy: {
    flex: 1,
    marginLeft: 11,
  },
  contactPickerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 19,
    marginTop: 0,
    marginBottom: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contactPickerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(25, 212, 220, 0.13)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  contactPickerGlyph: {
    color: COLORS.primary,
    fontSize: 28,
    fontWeight: '500',
    lineHeight: 31,
  },
  logoutButton: {
    alignItems: 'center',
    padding: 18,
    minHeight: 52,
    justifyContent: 'center',
  },
  logoutText: {
    color: '#767C89',
    fontSize: 13,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#101219',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 9,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  tabIcon: {
    color: '#747A87',
    fontSize: 21,
    fontWeight: 'bold',
  },
  tabIconActive: {
    color: COLORS.primary,
  },
  tabAlertIcon: {
    color: COLORS.danger,
  },
  tabText: {
    color: '#747A87',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
  tabTextActive: {
    color: COLORS.text,
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 25,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 55,
    height: 55,
    borderRadius: 28,
    backgroundColor: 'rgba(25, 212, 220, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  emptyIcon: {
    color: COLORS.primary,
    fontSize: 28,
  },
  contactCard: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 82,
  },
  contactCardSelected: {
    borderColor: 'rgba(25, 212, 220, 0.42)',
    backgroundColor: '#111A20',
  },
  contactAvatar: {
    width: 45,
    height: 45,
    borderRadius: 16,
    backgroundColor: '#222136',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    color: '#C9A1FF',
    fontSize: 17,
    fontWeight: '900',
  },
  contactDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
    minHeight: 54,
  },
  contactName: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 3,
  },
  contactPhone: {
    color: COLORS.muted,
    fontSize: 12,
  },
  removeText: {
    color: '#989DA8',
    fontSize: 20,
    fontWeight: '500',
  },
  removeButton: {
    width: 34,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  selectCheck: {
    width: 23,
    height: 23,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#4C5260',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
  },
  selectCheckActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  selectCheckText: {
    color: '#07151A',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },
  selectedText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 6,
  },
  unselectedText: {
    color: '#777D89',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 6,
  },
  warningContainer: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingTop: 24,
    paddingBottom: 32,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 9,
    marginBottom: 35,
  },
  warningHeaderMark: {
    width: 29,
    height: 29,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningHeaderMarkText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '900',
  },
  warningHeaderBrand: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
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
    letterSpacing: 2.3,
    fontSize: 10,
  },
  warningTitle: {
    color: COLORS.text,
    fontSize: 29,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'center',
  },
  warningDescription: {
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 14,
    maxWidth: 310,
  },
  sosGraphic: {
    width: 248,
    height: 248,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  sosOuterRing: {
    width: 232,
    height: 232,
    borderRadius: 116,
    borderWidth: 2,
    borderColor: '#FF6038',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-18deg' }],
  },
  sosMidRing: {
    width: 198,
    height: 198,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: 'rgba(255, 91, 48, 0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '18deg' }],
  },
  sosButton: {
    width: 166,
    height: 166,
    borderRadius: 83,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF4D2E',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 51,
    lineHeight: 57,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sosSubtext: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  countdownLabel: {
    color: '#A7ABB6',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.1,
    marginBottom: 2,
  },
  countdownTime: {
    color: COLORS.text,
    fontSize: 47,
    lineHeight: 56,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1.5,
    marginBottom: 3,
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
    color: '#858B98',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 15,
    maxWidth: 320,
  },
  demoFinished: {
    color: COLORS.text,
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
