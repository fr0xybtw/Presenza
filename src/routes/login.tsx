import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { QrCode } from "lucide-react";

const searchSchema = z.object({ mode: z.enum(["login", "signup"]).optional() });

export const Route = createFileRoute("/login")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Sign in — Presenza" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">(initialMode ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"attendee" | "organizer">("attendee");
  const [loading, setLoading] = useState(false);

  const { user, role: existingRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && existingRole) {
      navigate({ to: existingRole === "organizer" ? "/organizer" : "/attendee", replace: true });
    }
  }, [user, existingRole, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, role },
          },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-background to-accent/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link to="/" className="inline-flex items-center justify-center gap-2 mb-2">
            <QrCode className="w-6 h-6 text-primary" /><span className="font-semibold">Presenza</span>
          </Link>
          <CardTitle>{mode === "signup" ? "Create your account" : "Welcome back"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <Label>I am a…</Label>
                  <RadioGroup value={role} onValueChange={(v) => setRole(v as "attendee" | "organizer")} className="grid grid-cols-2 gap-2 mt-2">
                    <label className="flex items-center gap-2 border rounded-md p-3 cursor-pointer hover:bg-accent">
                      <RadioGroupItem value="attendee" /> Attendee
                    </label>
                    <label className="flex items-center gap-2 border rounded-md p-3 cursor-pointer hover:bg-accent">
                      <RadioGroupItem value="organizer" /> Organizer
                    </label>
                  </RadioGroup>
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            className="block w-full text-sm text-muted-foreground hover:text-foreground mt-4 text-center"
          >
            {mode === "signup" ? "Already have an account? Sign in" : "No account? Create one"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
