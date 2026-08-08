import { registerGlobals } from '@livekit/react-native';

let globalsRegistered = false;

export function registerLiveKitGlobals() {
  if (!globalsRegistered) {
    registerGlobals();
    globalsRegistered = true;
  }
}

export function createAudioOnlyRoom() {
  registerLiveKitGlobals();

  return {
    connect: async () => undefined,
    disconnect: async () => undefined,
  };
}
