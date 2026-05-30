import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Calendar } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/organizer")({
  head: () => ({ meta: [{ title: "Organizer dashboard" }] }),
  component: OrganizerDashboard,
});

function OrganizerDashboard() {
  const { user, role } = useAuth();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["organizer-sessions", user?.id],
    enabled: !!user && role === "organizer",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, name, description, status, start_time, end_time, geo_radius_meters, attendance_records(count), session_attendees(count)")
        .eq("organizer_id", user!.id)
        .order("start_time", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (role && role !== "organizer") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p>This dashboard is for organizers. <Link to="/attendee" className="text-primary underline">Go to attendee view</Link>.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">Manage your check-in sessions</p>
        </div>
        <Button asChild><Link to="/organizer/new"><Plus className="w-4 h-4 mr-1" /> New session</Link></Button>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Card key={i} className="h-40 animate-pulse" />)}
        </div>
      ) : (sessions ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-50" />
            No sessions yet. Create your first one to start checking attendees in.
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions!.map((s) => {
            const attCount = (s.attendance_records?.[0] as { count: number } | undefined)?.count ?? 0;
            const enrolledCount = (s.session_attendees?.[0] as { count: number } | undefined)?.count ?? 0;
            return (
              <Link key={s.id} to="/organizer/$sessionId" params={{ sessionId: s.id }} className="block">
                <Card className="hover:shadow-md transition cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg leading-tight">{s.name}</CardTitle>
                      <StatusBadge status={s.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    <div>{format(new Date(s.start_time), "MMM d, p")}</div>
                    <div className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {attCount} / {enrolledCount} checked in</div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
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
