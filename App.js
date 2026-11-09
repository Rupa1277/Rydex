
import React, { useEffect, useState } from 'react';
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

export default function App() {
  const [screen, setScreen] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [contacts, setContacts] = useState([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [seconds, setSeconds] = useState(15);

  // Demo accident-warning countdown.
  useEffect(() => {
    if (screen !== 'warning' || seconds <= 0) return;

    const timer = setTimeout(() => {
      setSeconds(value => value - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [screen, seconds]);

  const login = () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing information', 'Please enter your email and password.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    // Temporary demonstration login. Firebase will be added later.
    setScreen('dashboard');
  };

  const addContact = () => {
    const name = contactName.trim();
    const phone = contactPhone.trim();

    if (!name || !phone) {
      Alert.alert('Missing information', 'Enter both the contact name and phone number.');
      return;
    }

    if (!/^\+?[0-9\s()-]{7,18}$/.test(phone)) {
      Alert.alert('Invalid phone number', 'Please enter a valid phone number.');
      return;
    }

    setContacts(current => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, name, phone },
    ]);

    setContactName('');
    setContactPhone('');
    Alert.alert('Contact added', `${name} was added to your emergency contacts.`);
  };

  const removeContact = (id) => {
    setContacts(current => current.filter(contact => contact.id !== id));
  };

  const startDemoAccident = () => {
    setSeconds(15);
    setScreen('warning');
  };

  const stopDemoAccident = () => {
    setScreen('dashboard');
    Alert.alert('Demo stopped', 'The demonstration warning was cancelled. No alert was sent.');
  };

  const Header = ({ title, subtitle }) => (
    <View style={styles.header}>
      <Text style={styles.brand}>RIDESAFE</Text>
      <Text style={styles.heading}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );

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

  const TabBar = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity style={styles.tab} onPress={() => setScreen('dashboard')}>
        <Text style={styles.tabIcon}>⌂</Text>
        <Text style={styles.tabText}>Home</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tab} onPress={() => setScreen('contacts')}>
        <Text style={styles.tabIcon}>♡</Text>
        <Text style={styles.tabText}>Contacts</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tab} onPress={startDemoAccident}>
        <Text style={styles.tabIcon}>!</Text>
        <Text style={styles.tabText}>Test alert</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

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
            <Text style={styles.sectionTitle}>Welcome back</Text>
            <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={COLORS.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <PrimaryButton title="LOGIN  →" onPress={login} />
            <Text style={styles.helperText}>
              Demo interface: authentication will be connected to Firebase in a later milestone.
            </Text>
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
                  <Text style={styles.statusTitle}>App interface ready</Text>
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
              <Text style={styles.cardLabel}>INTERFACE TEST</Text>
              <Text style={styles.infoTitle}>Accident warning screen</Text>
              <Text style={styles.mutedText}>
                Preview the warning and countdown flow. This test will not send a real alert.
              </Text>
              <PrimaryButton
                title="START DEMO ALERT"
                onPress={startDemoAccident}
                danger
              />
            </View>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => setScreen('login')}
            >
              <Text style={styles.logoutText}>Log out of demo</Text>
            </TouchableOpacity>
          </ScrollView>
          <TabBar />
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
              <Text style={styles.sectionTitle}>Add a contact</Text>

              <Text style={styles.fieldLabel}>CONTACT NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Family member"
                placeholderTextColor={COLORS.muted}
                value={contactName}
                onChangeText={setContactName}
              />

              <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. +91 9876543210"
                placeholderTextColor={COLORS.muted}
                keyboardType="phone-pad"
                value={contactPhone}
                onChangeText={setContactPhone}
              />

              <PrimaryButton title="+ ADD CONTACT" onPress={addContact} />
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
                  </View>
                  <TouchableOpacity onPress={() => removeContact(contact.id)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <Text style={styles.helperText}>
              Contacts are currently stored in temporary app memory. Persistent storage will be added later.
            </Text>
          </ScrollView>
          <TabBar />
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
            <Text style={styles.cardLabel}>DEMO COUNTDOWN</Text>
            <Text style={styles.timerNumber}>{seconds}</Text>
            <Text style={styles.mutedText}>seconds remaining</Text>
          </View>

          <Text style={styles.warningHint}>
            The Stop button becomes available after 5 seconds.
          </Text>

          <PrimaryButton
            title="I AM SAFE — STOP ALERT"
            onPress={stopDemoAccident}
            disabled={seconds > 10}
          />

          {seconds === 0 && (
            <Text style={styles.demoFinished}>
              Demo countdown finished. No emergency message was sent.
            </Text>
          )}

          <TouchableOpacity onPress={() => setScreen('dashboard')}>
            <Text style={styles.backText}>Return to dashboard</Text>
          </TouchableOpacity>
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
