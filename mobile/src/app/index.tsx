import * as Device from 'expo-device';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useCall } from '@/providers/CallProvider';

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText> in terminal
    </ThemedText>
  );
}

export default function HomeScreen() {
  const [recipientId, setRecipientId] = useState('');
  const { callState, error, callSession, callerIdentity, startCall, acceptCall, declineCall, endCall, resetCall } = useCall();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            Speak call test
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <ThemedText type="small">Recipient ID</ThemedText>
          <TextInput
            value={recipientId}
            onChangeText={setRecipientId}
            placeholder="Recipient user ID"
            style={styles.input}
          />
          <Pressable onPress={() => void startCall(recipientId)} style={styles.button}>
            <ThemedText type="small">Call</ThemedText>
          </Pressable>

          <ThemedText type="small">Status: {callState}</ThemedText>
          {error ? <ThemedText type="small">Error: {error}</ThemedText> : null}
          {callSession ? <ThemedText type="small">Session: {callSession.id}</ThemedText> : null}
        </ThemedView>

        {callState === 'incoming' && callSession ? (
          <ThemedView type="backgroundElement" style={styles.overlay}>
            <ThemedText type="small">Incoming call from {callerIdentity ?? 'unknown'}</ThemedText>
            <Pressable onPress={() => void acceptCall()} style={[styles.button, styles.acceptButton]}>
              <ThemedText type="small">Accept</ThemedText>
            </Pressable>
            <Pressable onPress={() => void declineCall()} style={[styles.button, styles.declineButton]}>
              <ThemedText type="small">Decline</ThemedText>
            </Pressable>
          </ThemedView>
        ) : null}

        {callState === 'connected' ? (
          <ThemedView type="backgroundElement" style={styles.overlay}>
            <ThemedText type="small">Connected · microphone active</ThemedText>
            <Pressable onPress={() => void endCall()} style={[styles.button, styles.declineButton]}>
              <ThemedText type="small">End Call</ThemedText>
            </Pressable>
          </ThemedView>
        ) : null}

        {error ? (
          <Pressable onPress={() => resetCall()} style={[styles.button, styles.acceptButton]}>
            <ThemedText type="small">Reset</ThemedText>
          </Pressable>
        ) : null}

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <HintRow
            title="Try editing"
            hint={<ThemedText type="code">src/app/index.tsx</ThemedText>}
          />
          <HintRow title="Dev tools" hint={getDevMenuHint()} />
          <HintRow
            title="Fresh start"
            hint={<ThemedText type="code">npm run reset-project</ThemedText>}
          />
        </ThemedView>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  input: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#208AEF',
  },
  acceptButton: {
    backgroundColor: '#2e7d32',
  },
  declineButton: {
    backgroundColor: '#c62828',
  },
  overlay: {
    gap: Spacing.two,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
});
