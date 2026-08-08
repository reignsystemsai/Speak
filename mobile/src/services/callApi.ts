import { backendUrl } from '../config/runtime';

export interface LiveKitTokenRequest {
  participantIdentity: string;
  roomName: string;
}

export interface LiveKitTokenResponse {
  token: string;
}

export async function requestLiveKitToken(participantIdentity: string, roomName: string): Promise<string> {
  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/api/livekit/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      participantIdentity,
      roomName,
    } satisfies LiveKitTokenRequest),
  });

  if (!response.ok) {
    throw new Error(`LiveKit token request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as LiveKitTokenResponse;

  if (!payload?.token) {
    throw new Error('LiveKit token response was invalid');
  }

  return payload.token;
}
