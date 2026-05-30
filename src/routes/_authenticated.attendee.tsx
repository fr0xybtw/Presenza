import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QrCode, History, MapPin } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/attendee")({
  head: () => ({ meta: [{ title: "My sessions" }] }),
  component: AttendeeHome,
});

function AttendeeHome() {
  const { user } = useAuth();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["attendee-sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_attendees")
        .select("session_id, sessions!inner(id, name, description, start_time, end_time, status, geo_radius_meters)")
        .eq("attendee_id", user!.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["attendee-history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("checked_in_at, is_late, sessions!inner(name)")
        .eq("attendee_id", user!.id)
        .order("checked_in_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Button asChild size="lg" className="w-full h-20 text-lg">
        <Link to="/attendee/scan"><QrCode className="w-7 h-7 mr-2" /> Scan to check in</Link>
      </Button>

      <Card>
        <CardHeader><CardTitle>Your sessions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />)}</div>
          ) : (sessions ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No sessions yet. Ask your organizer to enroll you.</p>
          ) : sessions!.map((row) => {
            const s = row.sessions;
            return (
              <div key={s.id} className="border rounded-md p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {format(new Date(s.start_time), "MMM d, p")} · <MapPin className="w-3 h-3" /> {s.geo_radius_meters}m radius
                  </div>
                </div>
                <Badge className={s.status === "active" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
                  {s.status}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Recent check-ins</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(history ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No check-ins yet.</p>
          ) : history!.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
              <span>{r.sessions.name}</span>
              <span className="text-muted-foreground">
                {format(new Date(r.checked_in_at), "MMM d, p")} {r.is_late && <Badge variant="outline" className="ml-1">Late</Badge>}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
