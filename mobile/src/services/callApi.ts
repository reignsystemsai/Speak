import { backendUrl } from '../config/runtime';

export interface CallSession {
  id: string;
  caller_id: string;
  recipient_id: string;
  room_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface LiveKitTokenResponse {
  server_url: string;
  participant_token: string;
  room_name: string;
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    throw new Error('Empty response');
  }

  return JSON.parse(text) as T;
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const payload = await parseJson<{ error?: string }>(response);
    return payload.error;
  } catch {
    return undefined;
  }
}

function buildHeaders(accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export async function createCallSession(recipientId: string, accessToken: string | null): Promise<CallSession> {
  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/call-sessions`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ recipientId }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? 'Call creation failed');
  }

  const payload = await parseJson<{ call?: CallSession }>(response);
  if (!payload.call) {
    throw new Error('Invalid call session response');
  }

  return payload.call;
}

export async function fetchIncomingCall(accessToken: string | null): Promise<CallSession | null> {
  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/call-sessions/incoming`, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? 'Incoming call fetch failed');
  }

  const payload = await parseJson<{ call?: CallSession | null }>(response);
  return payload.call ?? null;
}

export async function fetchCallSession(callId: string, accessToken: string | null): Promise<CallSession> {
  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/call-sessions/${callId}`, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? 'Call fetch failed');
  }

  const payload = await parseJson<{ call?: CallSession }>(response);
  if (!payload.call) {
    throw new Error('Invalid call session response');
  }

  return payload.call;
}

export async function updateCallSession(callId: string, status: string, accessToken: string | null): Promise<CallSession> {
  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/call-sessions/${callId}`, {
    method: 'PATCH',
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? 'Call update failed');
  }

  const payload = await parseJson<{ call?: CallSession }>(response);
  if (!payload.call) {
    throw new Error('Invalid call update response');
  }

  return payload.call;
}

export async function requestLiveKitToken(callId: string, accessToken: string | null): Promise<LiveKitTokenResponse> {
  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/livekit/token`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ callId }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? 'LiveKit token request failed');
  }

  const payload = await parseJson<LiveKitTokenResponse>(response);
  if (!payload.participant_token || !payload.room_name) {
    throw new Error('Invalid LiveKit token response');
  }

  return payload;
}
