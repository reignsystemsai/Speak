import express from "express";

export function createCallSessionsRouter(supabase) {
  const router = express.Router();

  async function getAuthenticatedUser(request) {
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return { error: { status: 401, code: "AUTH_REQUIRED" } };
    }

    const accessToken = authorization.slice(7).trim();
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data?.user) {
      return { error: { status: 401, code: "INVALID_AUTH_TOKEN" } };
    }

    return { user: data.user };
  }

  function toCallResponse(call) {
    return {
      id: call.id,
      caller_id: call.caller_id,
      recipient_id: call.recipient_id,
      room_name: call.room_name,
      status: call.status,
      created_at: call.created_at,
      updated_at: call.updated_at,
      ended_at: call.ended_at,
    };
  }

  router.post("/", async (request, response) => {
    try {
      const auth = await getAuthenticatedUser(request);
      if (auth.error) {
        return response.status(auth.error.status).json({ error: auth.error.code });
      }

      const { recipientId } = request.body ?? {};
      if (!recipientId || typeof recipientId !== "string") {
        return response.status(400).json({ error: "RECIPIENT_ID_REQUIRED" });
      }

      if (recipientId === auth.user.id) {
        return response.status(400).json({ error: "RECIPIENT_MUST_DIFFER" });
      }

      const callId = crypto.randomUUID();
      const roomName = `call_${callId}`;
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("call_sessions")
        .insert({
          id: callId,
          caller_id: auth.user.id,
          recipient_id: recipientId,
          room_name: roomName,
          status: "ringing",
          created_at: now,
          updated_at: now,
          ended_at: null,
        })
        .select()
        .single();

      if (error || !data) {
        return response.status(500).json({ error: "CALL_CREATE_FAILED" });
      }

      return response.status(201).json({ call: toCallResponse(data) });
    } catch (error) {
      return response.status(500).json({ error: "CALL_CREATE_FAILED" });
    }
  });

  router.get("/incoming", async (request, response) => {
    try {
      const auth = await getAuthenticatedUser(request);
      if (auth.error) {
        return response.status(auth.error.status).json({ error: auth.error.code });
      }

      const { data, error } = await supabase
        .from("call_sessions")
        .select("id, caller_id, recipient_id, room_name, status, created_at, updated_at, ended_at")
        .eq("recipient_id", auth.user.id)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return response.status(500).json({ error: "CALL_FETCH_FAILED" });
      }

      return response.status(200).json({ call: data ? toCallResponse(data) : null });
    } catch (error) {
      return response.status(500).json({ error: "CALL_FETCH_FAILED" });
    }
  });

  router.get("/:id", async (request, response) => {
    try {
      const auth = await getAuthenticatedUser(request);
      if (auth.error) {
        return response.status(auth.error.status).json({ error: auth.error.code });
      }

      const { id } = request.params;
      const { data, error } = await supabase
        .from("call_sessions")
        .select("id, caller_id, recipient_id, room_name, status, created_at, updated_at, ended_at")
        .eq("id", id)
        .single();

      if (error || !data) {
        return response.status(404).json({ error: "CALL_NOT_FOUND" });
      }

      if (data.caller_id !== auth.user.id && data.recipient_id !== auth.user.id) {
        return response.status(403).json({ error: "NOT_A_PARTICIPANT" });
      }

      return response.status(200).json({ call: toCallResponse(data) });
    } catch (error) {
      return response.status(500).json({ error: "CALL_FETCH_FAILED" });
    }
  });

  router.patch("/:id", async (request, response) => {
    try {
      const auth = await getAuthenticatedUser(request);
      if (auth.error) {
        return response.status(auth.error.status).json({ error: auth.error.code });
      }

      const { id } = request.params;
      const { status } = request.body ?? {};

      if (typeof status !== "string") {
        return response.status(400).json({ error: "STATUS_REQUIRED" });
      }

      const validTransitions = {
        ringing: ["connecting", "declined", "ended"],
        connecting: ["active", "ended"],
        active: ["ended"],
        declined: [],
        ended: [],
      };

      const { data: existing, error: fetchError } = await supabase
        .from("call_sessions")
        .select("id, caller_id, recipient_id, status, ended_at")
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        return response.status(404).json({ error: "CALL_NOT_FOUND" });
      }

      if (existing.caller_id !== auth.user.id && existing.recipient_id !== auth.user.id) {
        return response.status(403).json({ error: "NOT_A_PARTICIPANT" });
      }

      if (!validTransitions[existing.status]?.includes(status)) {
        return response.status(409).json({ error: "INVALID_STATUS_TRANSITION" });
      }

      if (existing.status === status) {
        return response.status(200).json({ call: toCallResponse(existing) });
      }

      const nextStatus = status;
      const now = new Date().toISOString();
      const updates = {
        status: nextStatus,
        updated_at: now,
        ended_at: nextStatus === "declined" || nextStatus === "ended" ? now : null,
      };

      const { data, error } = await supabase
        .from("call_sessions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error || !data) {
        return response.status(500).json({ error: "CALL_UPDATE_FAILED" });
      }

      return response.status(200).json({ call: toCallResponse(data) });
    } catch (error) {
      return response.status(500).json({ error: "CALL_UPDATE_FAILED" });
    }
  });

  return router;
}
