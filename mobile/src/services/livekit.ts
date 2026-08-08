import { registerGlobals } from '@livekit/react-native';

export interface AudioRoom {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  publishAudio: () => Promise<void>;
  unpublishAudio: () => Promise<void>;
}

let globalsRegistered = false;

export function registerLiveKitGlobals() {
  if (!globalsRegistered) {
    registerGlobals();
    globalsRegistered = true;
  }
}

export function createAudioOnlyRoom(): AudioRoom {
  registerLiveKitGlobals();

  return {
    connect: async () => undefined,
    disconnect: async () => undefined,
    publishAudio: async () => undefined,
    unpublishAudio: async () => undefined,
  };
}
