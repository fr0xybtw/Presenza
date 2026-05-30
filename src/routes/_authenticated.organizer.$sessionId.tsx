import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { rotateSessionToken, resetAttendeeDevice } from "@/lib/checkin.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QRDisplay, CountdownRing } from "@/components/QRDisplay";
import { MapPicker } from "@/components/MapPicker";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Download, RotateCcw, UserPlus, Flag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/organizer/$sessionId")({
  head: () => ({ meta: [{ title: "Session" }] }),
  component: SessionDetail,
});

function SessionDetail() {
  const { sessionId } = Route.useParams();
  const qc = useQueryClient();
  const rotateFn = useServerFn(rotateSessionToken);
  const resetDeviceFn = useServerFn(resetAttendeeDevice);
  const [seconds, setSeconds] = useState(30);

  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions").select("*").eq("id", sessionId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollments, refetch: refetchEnroll } = useQuery({
    queryKey: ["session-enrollments", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_attendees")
        .select("attendee_id, profiles!inner(id, full_name, email)")
        .eq("session_id", sessionId);
      if (error) throw error;
      return data;
    },
  });

  const { data: attendance } = useQuery({
    queryKey: ["session-attendance", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*, profiles!inner(full_name, email)")
        .eq("session_id", sessionId)
        .order("checked_in_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Realtime attendance updates
  useEffect(() => {
    const ch = supabase
      .channel("session-" + sessionId)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records", filter: `session_id=eq.${sessionId}` }, () => {
        qc.invalidateQueries({ queryKey: ["session-attendance", sessionId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, qc]);

  // Token rotation timer (only when active)
  useEffect(() => {
    if (!session || session.status !== "active") return;
    let timer: ReturnType<typeof setInterval>;
    let mounted = true;
    async function rotate() {
      try {
        await rotateFn({ data: { sessionId } });
        if (!mounted) return;
        setSeconds(30);
        refetchSession();
      } catch (e) {
        console.error(e);
      }
    }
    rotate();
    timer = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { rotate(); return 30; }
        return s - 1;
      });
    }, 1000);
    return () => { mounted = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, sessionId]);

  async function setStatus(status: "scheduled" | "active" | "closed") {
    const extra: { status: typeof status; short_code?: string } = { status };
    if (status === "active" && !session?.short_code) {
      extra.short_code = Math.random().toString(36).slice(2, 8).toUpperCase();
    }
    const { error } = await supabase.from("sessions").update(extra).eq("id", sessionId);
    if (error) return toast.error(error.message);
    refetchSession();
  }

  function exportCsv() {
    if (!attendance) return;
    const rows = [
      ["Name", "Email", "Checked in at", "Late", "Flagged", "Reason", "Lat", "Lng", "Accuracy(m)", "Device"],
      ...attendance.map((r) => [
        r.profiles.full_name,
        r.profiles.email,
        r.checked_in_at,
        r.is_late ? "yes" : "no",
        r.is_flagged ? "yes" : "no",
        r.flag_reason ?? "",
        r.lat ?? "",
        r.lng ?? "",
        r.accuracy ?? "",
        r.device_fingerprint ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-${sessionId}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!session) {
    return <div className="p-8 text-center text-muted-foreground">Loading session…</div>;
  }

  const qrPayload = session.current_token
    ? JSON.stringify({ sessionId: session.id, token: session.current_token, expiresAt: session.token_expires_at })
    : "";

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/organizer"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <h1 className="text-2xl font-bold flex-1">{session.name}</h1>
        <StatusBadge status={session.status} />
      </div>

      <div className="flex flex-wrap gap-2">
        {session.status !== "active" && <Button onClick={() => setStatus("active")}>Start session</Button>}
        {session.status === "active" && <Button variant="secondary" onClick={() => setStatus("closed")}>Close session</Button>}
        {session.status === "closed" && <Button variant="outline" onClick={() => setStatus("scheduled")}>Reopen as scheduled</Button>}
        <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
        <EnrollDialog sessionId={sessionId} onChange={refetchEnroll} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Live QR code</CardTitle></CardHeader>
          <CardContent>
            {session.status === "active" && qrPayload ? (
              <div className="flex flex-col items-center gap-4">
                <QRDisplay value={qrPayload} size={320} />
                <div className="flex items-center gap-3">
                  <CountdownRing seconds={seconds} />
                  <div className="text-sm">
                    <div className="font-medium">Refreshes every 30s</div>
                    <div className="text-muted-foreground">Code: <span className="font-mono">{session.short_code}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Start the session to display a rotating QR code.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Geofence</CardTitle></CardHeader>
          <CardContent>
            <MapPicker lat={session.geo_lat} lng={session.geo_lng} radius={session.geo_radius_meters} height={300} />
            <p className="text-sm text-muted-foreground mt-2">
              {format(new Date(session.start_time), "PPp")} → {format(new Date(session.end_time), "p")}
              {session.late_window_minutes > 0 && ` · Late window: ${session.late_window_minutes}m`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attendance ({attendance?.length ?? 0} / {enrollments?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(enrollments ?? []).map((en) => {
                const rec = attendance?.find((a) => a.attendee_id === en.attendee_id);
                return (
                  <TableRow key={en.attendee_id}>
                    <TableCell className="font-medium">{en.profiles.full_name || en.profiles.email}</TableCell>
                    <TableCell>
                      {rec ? (
                        <div className="flex gap-1">
                          <Badge className="bg-success text-success-foreground">Present</Badge>
                          {rec.is_late && <Badge variant="outline">Late</Badge>}
                          {rec.is_flagged && <Badge className="bg-destructive text-destructive-foreground"><Flag className="w-3 h-3 mr-1" />Flag</Badge>}
                        </div>
                      ) : <Badge variant="secondary">Absent</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{rec ? format(new Date(rec.checked_in_at), "p") : "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{rec ? `${rec.lat?.toFixed(4)},${rec.lng?.toFixed(4)} (±${Math.round(rec.accuracy ?? 0)}m)` : "—"}</TableCell>
                    <TableCell className="text-xs font-mono truncate max-w-[120px]">{rec?.device_fingerprint ?? "—"}</TableCell>
                    <TableCell>
                      {!rec && (
                        <Button size="sm" variant="outline" onClick={async () => {
                          const { error } = await supabase.from("attendance_records").insert({
                            session_id: sessionId, attendee_id: en.attendee_id, is_flagged: false, flag_reason: "Manually marked present",
                          });
                          if (error) toast.error(error.message);
                        }}>Mark present</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={async () => {
                        try {
                          await resetDeviceFn({ data: { attendeeId: en.attendee_id, sessionId } });
                          toast.success("Device reset");
                        } catch (e) { toast.error((e as Error).message); }
                      }} title="Reset registered device">
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(enrollments ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No attendees enrolled yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { className: string; label: string }> = {
    active: { className: "bg-success text-success-foreground", label: "Active" },
    scheduled: { className: "bg-primary/15 text-primary", label: "Scheduled" },
    closed: { className: "bg-muted text-muted-foreground", label: "Closed" },
  };
  const cfg = map[status] ?? map.scheduled;
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

function EnrollDialog({ sessionId, onChange }: { sessionId: string; onChange: () => void }) {
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function add() {
    setLoading(true);
    try {
      const { data: profile, error: pErr } = await supabase
        .from("profiles").select("id").eq("email", email).maybeSingle();
      if (pErr) throw pErr;
      if (!profile) {
        toast.error("No user with that email. They must sign up first.");
        return;
      }
      const { error } = await supabase
        .from("session_attendees")
        .insert({ session_id: sessionId, attendee_id: profile.id });
      if (error) throw error;
      toast.success("Enrolled");
      setEmail("");
      setOpen(false);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><UserPlus className="w-4 h-4 mr-1" /> Enroll attendee</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Enroll attendee</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="enroll-email">Attendee email</Label>
          <Input id="enroll-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alice@example.com" />
          <Button onClick={add} disabled={loading || !email}>{loading ? "Adding…" : "Add"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
