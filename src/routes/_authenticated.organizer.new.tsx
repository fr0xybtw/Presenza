import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPicker } from "@/components/MapPicker";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/organizer/new")({
  head: () => ({ meta: [{ title: "New session" }] }),
  component: NewSession,
});

function NewSession() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState(() => new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState(() => new Date(Date.now() + 65 * 60_000).toISOString().slice(0, 16));
  const [center, setCenter] = useState({ lat: 37.7749, lng: -122.4194 });
  const [radius, setRadius] = useState(50);
  const [lateMinutes, setLateMinutes] = useState(0);
  const [loading, setLoading] = useState(false);

  // Try to default to current location
  useState(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { timeout: 5000 },
      );
    }
    return null;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sessions")
        .insert({
          organizer_id: user.id,
          name,
          description,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          geo_lat: center.lat,
          geo_lng: center.lng,
          geo_radius_meters: radius,
          late_window_minutes: lateMinutes,
          status: "scheduled",
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Session created");
      navigate({ to: "/organizer/$sessionId", params: { sessionId: data.id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">New session</h1>
      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Math Class — Monday 9AM" />
            </div>
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="start">Start</Label>
                <Input id="start" type="datetime-local" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="end">End</Label>
                <Input id="end" type="datetime-local" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="late">Late check-in window (minutes after start)</Label>
              <Input id="late" type="number" min={0} max={240} value={lateMinutes} onChange={(e) => setLateMinutes(Number(e.target.value))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Geofence</CardTitle>
            <p className="text-sm text-muted-foreground">Tap the map to set the check-in center. Adjust the radius below.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <MapPicker lat={center.lat} lng={center.lng} radius={radius} editable onChange={setCenter} height={360} />
            <div>
              <Label>Radius: {radius}m</Label>
              <Slider min={10} max={500} step={5} value={[radius]} onValueChange={(v) => setRadius(v[0])} />
            </div>
            <div className="text-xs text-muted-foreground">Center: {center.lat.toFixed(5)}, {center.lng.toFixed(5)}</div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create session"}</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/organizer" })}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
