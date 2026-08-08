import cors from "cors";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";

const requiredEnvironmentVariables = [
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  (name) => !process.env[name]
);

if (missingEnvironmentVariables.length > 0) {
  throw new Error(
    `Missing environment variables: ${missingEnvironmentVariables.join(", ")}`
  );
}

const app = express();
const port = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.post("/livekit/token", async (request, response) => {
  try {
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return response.status(401).json({ error: "AUTH_REQUIRED" });
    }

    const supabaseAccessToken = authorization.slice(7).trim();
    const { callId } = request.body ?? {};

    if (!callId || typeof callId !== "string") {
      return response.status(400).json({ error: "CALL_ID_REQUIRED" });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(supabaseAccessToken);

    if (userError || !user) {
      return response.status(401).json({ error: "INVALID_AUTH_TOKEN" });
    }

    const { data: call, error: callError } = await supabase
      .from("call_sessions")
      .select("id, caller_id, recipient_id, status")
      .eq("id", callId)
      .single();

    if (callError || !call) {
      return response.status(404).json({ error: "CALL_NOT_FOUND" });
    }

    const isParticipant =
      user.id === call.caller_id || user.id === call.recipient_id;

    if (!isParticipant) {
      return response.status(403).json({ error: "NOT_A_PARTICIPANT" });
    }

    if (!["ringing", "connecting", "active"].includes(call.status)) {
      return response.status(409).json({ error: "CALL_NOT_ACTIVE" });
    }

    const roomName = `call_${call.id}`;

    const liveKitToken = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: user.id,
        ttl: "15m",
      }
    );

    liveKitToken.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });

    const participantToken = await liveKitToken.toJwt();

    return response.status(201).json({
      server_url: process.env.LIVEKIT_URL,
      participant_token: participantToken,
      room_name: roomName,
    });
  } catch (error) {
    console.error("Token creation failed:", error);
    return response.status(500).json({ error: "TOKEN_CREATION_FAILED" });
  }
});

app.listen(port, () => {
  console.log(`Speak backend listening on port ${port}`);
});

