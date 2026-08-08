import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { requestLiveKitToken } from '../services/callApi';
import { createAudioOnlyRoom } from '../services/livekit';

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'error';

interface CallContextValue {
  callState: CallState;
  room: ReturnType<typeof createAudioOnlyRoom> | null;
  error: string | null;
  startCall: (participantIdentity: string, roomName: string) => Promise<void>;
  acceptCall: (roomName: string, participantIdentity: string) => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  resetCall: () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

interface PendingCallState {
  generation: number;
  roomName: string;
  participantIdentity: string;
  token: string | null;
  room: ReturnType<typeof createAudioOnlyRoom> | null;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [room, setRoom] = useState<ReturnType<typeof createAudioOnlyRoom> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCall, setPendingCall] = useState<PendingCallState | null>(null);
  const generationRef = useRef(0);
  const activeRoomRef = useRef<ReturnType<typeof createAudioOnlyRoom> | null>(null);
  const pendingOperationRef = useRef(0);

  const clearLocalState = useCallback((nextState: CallState = 'idle') => {
    pendingOperationRef.current += 1;
    setCallState(nextState);
    setError(null);
    setPendingCall(null);

    const currentRoom = activeRoomRef.current;
    activeRoomRef.current = null;
    setRoom(null);

    if (currentRoom) {
      void currentRoom.disconnect().catch(() => undefined);
    }
  }, []);

  const cleanupRoom = useCallback((roomToCleanup: ReturnType<typeof createAudioOnlyRoom> | null) => {
    if (!roomToCleanup) {
      return;
    }

    const cleanupGeneration = generationRef.current;
    void Promise.resolve().then(() => {
      if (cleanupGeneration !== generationRef.current) {
        return;
      }
      void roomToCleanup.disconnect().catch(() => undefined);
    });
  }, []);

  const resetCall = useCallback(() => {
    generationRef.current += 1;
    pendingOperationRef.current += 1;
    setCallState('idle');
    setError(null);
    setPendingCall(null);

    const currentRoom = activeRoomRef.current;
    activeRoomRef.current = null;
    setRoom(null);

    if (currentRoom) {
      void currentRoom.disconnect().catch(() => undefined);
    }
  }, []);

  const endCall = useCallback(async () => {
    generationRef.current += 1;
    pendingOperationRef.current += 1;
    const currentRoom = activeRoomRef.current;
    activeRoomRef.current = null;
    setRoom(null);
    setPendingCall(null);
    setError(null);
    setCallState('idle');

    if (currentRoom) {
      void currentRoom.disconnect().catch(() => undefined);
    }
  }, []);

  const declineCall = useCallback(async () => {
    generationRef.current += 1;
    pendingOperationRef.current += 1;
    const currentRoom = activeRoomRef.current;
    activeRoomRef.current = null;
    setRoom(null);
    setPendingCall(null);
    setError(null);
    setCallState('idle');

    if (currentRoom) {
      void currentRoom.disconnect().catch(() => undefined);
    }
  }, []);

  const connectRoom = useCallback(async (participantIdentity: string, roomName: string, token: string, incoming: boolean) => {
    const currentGeneration = generationRef.current;
    const nextRoom = createAudioOnlyRoom();
    activeRoomRef.current = nextRoom;
    setRoom(nextRoom);
    setPendingCall({
      generation: currentGeneration,
      roomName,
      participantIdentity,
      token,
      room: nextRoom,
    });

    try {
      setCallState(incoming ? 'incoming' : 'connecting');

      await nextRoom.connect();

      if (currentGeneration !== generationRef.current) {
        cleanupRoom(nextRoom);
        return;
      }

      setCallState('connected');
      setPendingCall(null);
    } catch (error) {
      if (currentGeneration !== generationRef.current) {
        cleanupRoom(nextRoom);
        return;
      }

      setError(error instanceof Error ? error.message : 'Call connection failed');
      setCallState('error');
      cleanupRoom(nextRoom);
      activeRoomRef.current = null;
      setRoom(null);
    }
  }, [cleanupRoom]);

  const startCall = useCallback(async (participantIdentity: string, roomName: string) => {
    generationRef.current += 1;
    pendingOperationRef.current += 1;
    setCallState('outgoing');
    setError(null);
    setPendingCall(null);

    const currentRoom = activeRoomRef.current;
    activeRoomRef.current = null;
    setRoom(null);

    if (currentRoom) {
      void currentRoom.disconnect().catch(() => undefined);
    }

    try {
      const token = await requestLiveKitToken(participantIdentity, roomName);
      if (generationRef.current !== pendingOperationRef.current) {
        return;
      }

      await connectRoom(participantIdentity, roomName, token, false);
    } catch (error) {
      if (generationRef.current !== pendingOperationRef.current) {
        return;
      }

      setError(error instanceof Error ? error.message : 'Call failed');
      setCallState('error');
      setPendingCall(null);
      activeRoomRef.current = null;
      setRoom(null);
    }
  }, [connectRoom]);

  const acceptCall = useCallback(async (roomName: string, participantIdentity: string) => {
    generationRef.current += 1;
    pendingOperationRef.current += 1;
    setCallState('incoming');
    setError(null);

    const currentRoom = activeRoomRef.current;
    activeRoomRef.current = null;
    setRoom(null);

    if (currentRoom) {
      void currentRoom.disconnect().catch(() => undefined);
    }

    try {
      const token = await requestLiveKitToken(participantIdentity, roomName);
      if (generationRef.current !== pendingOperationRef.current) {
        return;
      }

      await connectRoom(participantIdentity, roomName, token, true);
    } catch (error) {
      if (generationRef.current !== pendingOperationRef.current) {
        return;
      }

      setError(error instanceof Error ? error.message : 'Call failed');
      setCallState('error');
      setPendingCall(null);
      activeRoomRef.current = null;
      setRoom(null);
    }
  }, [connectRoom]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      pendingOperationRef.current += 1;
      const currentRoom = activeRoomRef.current;
      activeRoomRef.current = null;
      if (currentRoom) {
        void currentRoom.disconnect().catch(() => undefined);
      }
    };
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({
      callState,
      room,
      error,
      startCall,
      acceptCall,
      declineCall,
      endCall,
      resetCall,
    }),
    [acceptCall, callState, declineCall, endCall, error, resetCall, room, startCall],
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
