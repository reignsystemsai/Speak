import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './AuthProvider';
import { createCallSession, fetchIncomingCall, requestLiveKitToken, updateCallSession } from '../services/callApi';
import { createAudioOnlyRoom, type AudioRoom } from '../services/livekit';
import { supabase } from '../services/supabase';

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'error';

interface CallSessionRecord {
  id: string;
  caller_id: string;
  recipient_id: string;
  room_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

interface CallContextValue {
  callState: CallState;
  room: AudioRoom | null;
  error: string | null;
  callSession: CallSessionRecord | null;
  callerIdentity: string | null;
  startCall: (recipientId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  resetCall: () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const [callState, setCallState] = useState<CallState>('idle');
  const [room, setRoom] = useState<AudioRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callSession, setCallSession] = useState<CallSessionRecord | null>(null);
  const [callerIdentity, setCallerIdentity] = useState<string | null>(null);

  const generationRef = useRef(0);
  const activeRoomRef = useRef<AudioRoom | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ringbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringtoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOperationRef = useRef(0);
  const activeSessionRef = useRef<CallSessionRecord | null>(null);
  const currentUserId = user?.id ?? null;

  const stopAudio = useCallback(() => {
    if (ringbackTimerRef.current) {
      clearTimeout(ringbackTimerRef.current);
      ringbackTimerRef.current = null;
    }
    if (ringtoneTimerRef.current) {
      clearTimeout(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
  }, []);

  const clearLocalState = useCallback((nextState: CallState = 'idle') => {
    pendingOperationRef.current += 1;
    generationRef.current += 1;
    stopAudio();
    setCallState(nextState);
    setError(null);
    setCallSession(null);
    setCallerIdentity(null);
    activeSessionRef.current = null;

    const oldRoom = activeRoomRef.current;
    activeRoomRef.current = null;
    setRoom(null);

    if (oldRoom) {
      void oldRoom.disconnect().catch(() => undefined);
    }
  }, [stopAudio]);

  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    return true;
  }, []);

  const resetCall = useCallback(() => {
    clearLocalState('idle');
  }, [clearLocalState]);

  const beginOutgoingRingback = useCallback(() => {
    stopAudio();
    ringbackTimerRef.current = setTimeout(() => undefined, 1000);
  }, [stopAudio]);

  const beginIncomingRingtone = useCallback(() => {
    stopAudio();
    ringtoneTimerRef.current = setTimeout(() => undefined, 1000);
  }, [stopAudio]);

  const connectFreshRoom = useCallback(async (sessionRecord: CallSessionRecord, token: string, isIncoming: boolean) => {
    const generation = generationRef.current;
    const nextRoom = createAudioOnlyRoom();
    activeRoomRef.current = nextRoom;
    setRoom(nextRoom);
    setCallSession(sessionRecord);
    setCallerIdentity(isIncoming ? sessionRecord.caller_id : sessionRecord.recipient_id);
    setCallState('connecting');
    stopAudio();

    try {
      await nextRoom.connect();
      if (generation !== generationRef.current) {
        return;
      }

      await nextRoom.publishAudio();
      if (generation !== generationRef.current) {
        return;
      }

      setCallState('connected');
      activeSessionRef.current = sessionRecord;
    } catch (error) {
      if (generation !== generationRef.current) {
        return;
      }
      setError(error instanceof Error ? error.message : 'Call connection failed');
      setCallState('error');
      const oldRoom = activeRoomRef.current;
      activeRoomRef.current = null;
      setRoom(null);
      if (oldRoom) {
        void oldRoom.disconnect().catch(() => undefined);
      }
      activeSessionRef.current = null;
    }
  }, [stopAudio]);

  const handleRemoteSessionUpdate = useCallback(async (sessionRecord: CallSessionRecord) => {
    if (!currentUserId) {
      return;
    }

    if (sessionRecord.caller_id !== currentUserId && sessionRecord.recipient_id !== currentUserId) {
      return;
    }

    if (activeSessionRef.current?.id === sessionRecord.id) {
      if (sessionRecord.status === 'declined' || sessionRecord.status === 'ended') {
        clearLocalState('idle');
        return;
      }
    }

    if (sessionRecord.status === 'ringing' && sessionRecord.recipient_id === currentUserId) {
      if (callState !== 'incoming' || activeSessionRef.current?.id !== sessionRecord.id) {
        setCallSession(sessionRecord);
        setCallerIdentity(sessionRecord.caller_id);
        setError(null);
        setCallState('incoming');
        beginIncomingRingtone();
        activeSessionRef.current = sessionRecord;
      }
      return;
    }

    if (activeSessionRef.current?.id === sessionRecord.id && (sessionRecord.status === 'connecting' || sessionRecord.status === 'active')) {
      const generation = generationRef.current;
      const accessToken = session?.access_token ?? null;
      if (!accessToken) {
        setError('Authentication required');
        setCallState('error');
        return;
      }

      try {
        const tokenResponse = await requestLiveKitToken(sessionRecord.id, accessToken);
        if (generation !== generationRef.current) {
          return;
        }
        const nextRoom = createAudioOnlyRoom();
        activeRoomRef.current = nextRoom;
        setRoom(nextRoom);
        setCallSession(sessionRecord);
        setCallState('connecting');
        stopAudio();
        await nextRoom.connect();
        if (generation !== generationRef.current) {
          return;
        }
        await nextRoom.publishAudio();
        if (generation !== generationRef.current) {
          return;
        }
        setCallState('connected');
        activeSessionRef.current = sessionRecord;
      } catch (error) {
        if (generation !== generationRef.current) {
          return;
        }
        setError(error instanceof Error ? error.message : 'Call connection failed');
        setCallState('error');
        setRoom(null);
        activeSessionRef.current = null;
      }
    }
  }, [beginIncomingRingtone, callState, clearLocalState, currentUserId, session?.access_token, stopAudio]);

  const startCall = useCallback(async (recipientId: string) => {
    if (!recipientId || recipientId.trim().length === 0) {
      setError('Recipient is required');
      setCallState('error');
      return;
    }
    if (user?.id && recipientId === user.id) {
      setError('You cannot call yourself');
      setCallState('error');
      return;
    }
    if (callState === 'outgoing' || callState === 'incoming' || callState === 'connecting' || callState === 'connected') {
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    pendingOperationRef.current += 1;
    setError(null);
    setCallState('outgoing');
    beginOutgoingRingback();

    const accessToken = session?.access_token ?? null;
    if (!accessToken) {
      setError('Authentication required');
      setCallState('error');
      stopAudio();
      return;
    }

    try {
      const created = await createCallSession(recipientId, accessToken);
      if (generation !== generationRef.current) {
        return;
      }
      setCallSession(created);
      activeSessionRef.current = created;
      setCallerIdentity(created.recipient_id);
      setCallState('outgoing');
    } catch (error) {
      if (generation !== generationRef.current) {
        return;
      }
      setError(error instanceof Error ? error.message : 'Call setup failed');
      setCallState('error');
      stopAudio();
    }
  }, [beginOutgoingRingback, callState, session?.access_token, stopAudio, user?.id]);

  const acceptCall = useCallback(async () => {
    if (!callSession || callState === 'connecting' || callState === 'connected') {
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    pendingOperationRef.current += 1;
    setCallState('connecting');
    setError(null);
    stopAudio();

    const accessToken = session?.access_token ?? null;
    if (!accessToken) {
      setError('Authentication required');
      setCallState('error');
      return;
    }

    const granted = await requestMicrophonePermission();
    if (!granted) {
      setError('Microphone permission was denied');
      setCallState('error');
      void updateCallSession(callSession.id, 'ended', accessToken).catch(() => undefined);
      clearLocalState('idle');
      return;
    }

    try {
      const updated = await updateCallSession(callSession.id, 'connecting', accessToken);
      if (generation !== generationRef.current) {
        return;
      }
      setCallSession(updated);
      activeSessionRef.current = updated;
      const tokenResponse = await requestLiveKitToken(callSession.id, accessToken);
      if (generation !== generationRef.current) {
        return;
      }
      const nextRoom = createAudioOnlyRoom();
      activeRoomRef.current = nextRoom;
      setRoom(nextRoom);
      await nextRoom.connect();
      if (generation !== generationRef.current) {
        return;
      }
      await nextRoom.publishAudio();
      if (generation !== generationRef.current) {
        return;
      }
      await updateCallSession(callSession.id, 'active', accessToken);
      if (generation !== generationRef.current) {
        return;
      }
      setCallState('connected');
      setError(null);
    } catch (error) {
      if (generation !== generationRef.current) {
        return;
      }
      setCallState('error');
      setError(error instanceof Error ? error.message : 'Call failed');
      clearLocalState('idle');
    }
  }, [callSession, callState, clearLocalState, requestMicrophonePermission, session?.access_token, stopAudio]);

  const declineCall = useCallback(async () => {
    if (!callSession) {
      clearLocalState('idle');
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    pendingOperationRef.current += 1;
    const accessToken = session?.access_token ?? null;
    stopAudio();
    clearLocalState('idle');

    if (!accessToken) {
      return;
    }

    void updateCallSession(callSession.id, 'declined', accessToken).catch(() => undefined);
  }, [callSession, clearLocalState, session?.access_token, stopAudio]);

  const endCall = useCallback(async () => {
    if (!callSession) {
      clearLocalState('idle');
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    pendingOperationRef.current += 1;
    const accessToken = session?.access_token ?? null;
    stopAudio();
    clearLocalState('idle');

    if (!accessToken) {
      return;
    }

    void updateCallSession(callSession.id, 'ended', accessToken).catch(() => undefined);
  }, [callSession, clearLocalState, session?.access_token, stopAudio]);

  useEffect(() => {
    let isMounted = true;
    if (!user?.id) {
      clearLocalState('idle');
      return () => {
        isMounted = false;
      };
    }

    const channel = supabase.channel(`call-sessions-${user.id}`);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'call_sessions' }, (payload) => {
      if (!isMounted) {
        return;
      }
      const nextSession = (payload.new ?? payload.old) as CallSessionRecord | undefined;
      if (!nextSession) {
        return;
      }
      if (nextSession.caller_id !== user.id && nextSession.recipient_id !== user.id) {
        return;
      }
      void handleRemoteSessionUpdate(nextSession);
    });
    void channel.subscribe();
    channelRef.current = channel;

    void fetchIncomingCall(session?.access_token ?? null)
      .then((incomingCall) => {
        if (!isMounted || !incomingCall || !user?.id) {
          return;
        }
        if (incomingCall.recipient_id !== user.id) {
          return;
        }
        if (callSession?.id === incomingCall.id) {
          return;
        }
        setCallSession(incomingCall);
        activeSessionRef.current = incomingCall;
        setCallerIdentity(incomingCall.caller_id);
        setError(null);
        setCallState('incoming');
        beginIncomingRingtone();
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      clearLocalState('idle');
    };
  }, [beginIncomingRingtone, callSession?.id, clearLocalState, handleRemoteSessionUpdate, session?.access_token, user?.id]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      pendingOperationRef.current += 1;
      stopAudio();
      const oldRoom = activeRoomRef.current;
      activeRoomRef.current = null;
      if (oldRoom) {
        void oldRoom.disconnect().catch(() => undefined);
      }
    };
  }, [stopAudio]);

  const value = useMemo<CallContextValue>(
    () => ({
      callState,
      room,
      error,
      callSession,
      callerIdentity,
      startCall,
      acceptCall,
      declineCall,
      endCall,
      resetCall,
    }),
    [acceptCall, callSession, callState, callerIdentity, declineCall, endCall, error, resetCall, room, startCall],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const context = useContext(CallContext);

  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }

  return context;
}
