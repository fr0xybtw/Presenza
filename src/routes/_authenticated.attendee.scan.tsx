import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QRScanner } from "@/components/QRScanner";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { checkIn } from "@/lib/checkin.functions";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Keyboard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendee/scan")({
  head: () => ({ meta: [{ title: "Scan to check in" }] }),
  component: ScanPage,
});

type Result =
  | { kind: "success"; sessionName: string; checkedInAt: string; isLate: boolean }
  | { kind: "error"; message: string };

function ScanPage() {
  const checkInFn = useServerFn(checkIn);
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);

  async function submit(rawToken: string) {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Parse JSON payload from QR, or accept as plain token
      let token = rawToken.trim();
      try {
        const parsed = JSON.parse(rawToken);
        if (parsed && typeof parsed === "object" && parsed.token) token = parsed.token;
      } catch { /* not JSON, treat as plain code */ }

      // Geolocation
      if (!navigator.geolocation) {
        setResult({ kind: "error", message: "Your browser doesn't support GPS." });
        return;
      }
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
        });
      }).catch(() => null);

      if (!pos) {
        setResult({ kind: "error", message: "Location permission is required to check in." });
        return;
      }

      const fingerprint = await getDeviceFingerprint();
      const res = await checkInFn({
        data: {
          token,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          fingerprint,
        },
      });

      if (res.ok) {
        setResult({ kind: "success", sessionName: res.sessionName, checkedInAt: res.checkedInAt, isLate: res.isLate });
      } else {
        setResult({ kind: "error", message: res.reason });
      }
    } catch (e) {
      setResult({ kind: "error", message: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.kind === "success") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-3">
            <CheckCircle2 className="w-20 h-20 text-success mx-auto animate-in zoom-in" />
            <h2 className="text-2xl font-bold">Checked in!</h2>
            <p className="text-muted-foreground">{result.sessionName}</p>
            <p className="text-sm">{new Date(result.checkedInAt).toLocaleTimeString()}{result.isLate && " (Late)"}</p>
            <Button onClick={() => navigate({ to: "/attendee" })}>Done</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result?.kind === "error") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-3">
            <XCircle className="w-20 h-20 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Check-in failed</h2>
            <p className="text-muted-foreground">{result.message}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setResult(null)}>Try again</Button>
              <Button asChild><Link to="/attendee">Back</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/attendee"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <h1 className="text-xl font-bold">Check in</h1>
      </div>

      {submitting && (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Verifying location and device…
        </div>
      )}

      {!showManual ? (
        <>
          <Card>
            <CardHeader><CardTitle>Scan the QR</CardTitle></CardHeader>
            <CardContent>
              <QRScanner onScan={submit} onError={(e) => toast.error(e)} />
            </CardContent>
          </Card>
          <Button variant="outline" className="w-full" onClick={() => setShowManual(true)}>
            <Keyboard className="w-4 h-4 mr-1" /> Enter code manually
          </Button>
        </>
      ) : (
        <Card>
          <CardHeader><CardTitle>Enter session code</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="code">6-character code</Label>
            <Input id="code" value={manualCode} onChange={(e) => setManualCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" />
            <div className="flex gap-2">
              <Button onClick={() => submit(manualCode)} disabled={!manualCode || submitting}>Check in</Button>
              <Button variant="outline" onClick={() => setShowManual(false)}>Back to scanner</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        We'll ask for your location and verify your registered device. All checks happen server-side.
      </p>
    </div>
  );
}
