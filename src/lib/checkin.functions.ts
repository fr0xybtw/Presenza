import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { haversineMeters } from "./haversine";

const CheckInInput = z.object({
  token: z.string().min(4).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000),
  fingerprint: z.string().min(4).max(200),
});

export const checkIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CheckInInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const admin = supabaseAdmin;

    // Accuracy gate
    if (data.accuracy > 100) {
      return { ok: false, reason: `GPS accuracy too low (±${Math.round(data.accuracy)}m). Move to an open area and retry.` };
    }

    // Find session by current_token (or short_code)
    const { data: session, error: sErr } = await admin
      .from("sessions")
      .select("id, name, status, geo_lat, geo_lng, geo_radius_meters, current_token, token_expires_at, short_code, start_time, end_time, late_window_minutes")
      .or(`current_token.eq.${data.token},short_code.eq.${data.token.toUpperCase()}`)
      .maybeSingle();

    if (sErr || !session) return { ok: false, reason: "Invalid or expired code." };
    if (session.status !== "active") return { ok: false, reason: "Session is not currently active." };

    // Token expiry
    if (session.current_token === data.token) {
      if (!session.token_expires_at || new Date(session.token_expires_at) < new Date()) {
        return { ok: false, reason: "QR code expired. Ask the organizer for a fresh one." };
      }
    }

    // Enrollment
    const { data: enroll } = await admin
      .from("session_attendees")
      .select("attendee_id")
      .eq("session_id", session.id)
      .eq("attendee_id", userId)
      .maybeSingle();
    if (!enroll) return { ok: false, reason: "You're not enrolled in this session." };

    // Geofence
    const distance = haversineMeters(data.lat, data.lng, session.geo_lat, session.geo_lng);
    if (distance > session.geo_radius_meters) {
      return {
        ok: false,
        reason: `You must be physically present to check in (you're ~${Math.round(distance)}m away, allowed ${session.geo_radius_meters}m).`,
      };
    }

    // Device fingerprint
    const { data: profile } = await admin
      .from("profiles")
      .select("registered_device_fingerprint, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) return { ok: false, reason: "Profile not found." };

    if (!profile.registered_device_fingerprint) {
      await admin
        .from("profiles")
        .update({ registered_device_fingerprint: data.fingerprint })
        .eq("id", userId);
    } else if (profile.registered_device_fingerprint !== data.fingerprint) {
      return { ok: false, reason: "Check-in must be completed from your registered device." };
    }

    // Duplicate check
    const { data: existing } = await admin
      .from("attendance_records")
      .select("id")
      .eq("session_id", session.id)
      .eq("attendee_id", userId)
      .maybeSingle();
    if (existing) return { ok: false, reason: "You've already checked into this session." };

    // Detect suspicious fingerprint collision (same device, different attendee, same session)
    const { data: collisions } = await admin
      .from("attendance_records")
      .select("id, attendee_id")
      .eq("session_id", session.id)
      .eq("device_fingerprint", data.fingerprint);
    const flagged = (collisions?.length ?? 0) > 0;

    // Late detection
    const now = new Date();
    const start = new Date(session.start_time);
    const lateCutoff = new Date(start.getTime() + session.late_window_minutes * 60_000);
    const isLate = now > lateCutoff && session.late_window_minutes > 0 ? true : now > start;

    const { error: insErr } = await admin.from("attendance_records").insert({
      session_id: session.id,
      attendee_id: userId,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      device_fingerprint: data.fingerprint,
      is_flagged: flagged,
      flag_reason: flagged ? "Duplicate device fingerprint in same session" : null,
      is_late: isLate,
    });

    if (insErr) return { ok: false, reason: insErr.message };

    // If flagged, also flag the colliding records
    if (flagged && collisions) {
      await admin
        .from("attendance_records")
        .update({ is_flagged: true, flag_reason: "Duplicate device fingerprint in same session" })
        .in("id", collisions.map((c) => c.id));
    }

    return {
      ok: true,
      sessionName: session.name,
      checkedInAt: new Date().toISOString(),
      isLate,
      flagged,
    };
  });

// Rotate QR token (called by organizer page every 30s)
export const rotateSessionToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ sessionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin;
    const { data: session } = await admin
      .from("sessions")
      .select("organizer_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session || session.organizer_id !== context.userId) {
      throw new Error("Forbidden");
    }
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 35_000).toISOString();
    const { error } = await admin
      .from("sessions")
      .update({ current_token: token, token_expires_at: expires })
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { token, expiresAt: expires };
  });

// Reset attendee's registered device
export const resetAttendeeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ attendeeId: z.string().uuid(), sessionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin;
    const { data: session } = await admin
      .from("sessions")
      .select("organizer_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session || session.organizer_id !== context.userId) {
      throw new Error("Forbidden");
    }
    const { error } = await admin
      .from("profiles")
      .update({ registered_device_fingerprint: null })
      .eq("id", data.attendeeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
