import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { QrCode, ShieldCheck, MapPin, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Presenza — Geofenced QR Attendance" },
      { name: "description", content: "Rotating QR codes, GPS check-in, device-locked attendance." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading || !user || !role) return;
    navigate({ to: role === "organizer" ? "/organizer" : "/attendee", replace: true });
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <QrCode className="w-6 h-6 text-primary" />
          Presenza
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button>
          <Button asChild><Link to="/login" search={{ mode: "signup" }}>Get started</Link></Button>
        </div>
      </header>

      <main className="flex-1 px-6 max-w-6xl mx-auto w-full">
        <section className="py-20 text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Attendance, <span className="text-primary">verified.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Rotating QR codes, geofenced GPS check-ins, and device fingerprinting stop proxy
            attendance cold — for classes, teams, and shifts.
          </p>
          <div className="mt-8 flex gap-3 justify-center">
            <Button size="lg" asChild><Link to="/login" search={{ mode: "signup" }}>Create an account</Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/login">Sign in</Link></Button>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-6 pb-20">
          {[
            { icon: QrCode, title: "Rotating QR codes", body: "Tokens refresh every 30 seconds. Screenshots are useless." },
            { icon: MapPin, title: "Geofenced GPS", body: "Check-in requires being physically inside the session radius." },
            { icon: Smartphone, title: "Device-locked", body: "Each attendee binds to one device fingerprint. Collisions get flagged." },
          ].map((f) => (
            <div key={f.title} className="p-6 rounded-xl border bg-card">
              <f.icon className="w-7 h-7 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="px-6 py-6 text-center text-sm text-muted-foreground border-t">
        <ShieldCheck className="inline w-4 h-4 mr-1" /> All anti-fraud checks run server-side.
      </footer>
    </div>
  );
}
