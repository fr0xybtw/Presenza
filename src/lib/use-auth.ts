import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type Role = "organizer" | "attendee";

export interface AuthState {
  loading: boolean;
  user: User | null;
  session: Session | null;
  role: Role | null;
  fullName: string;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    user: null,
    session: null,
    role: null,
    fullName: "",
  });

  useEffect(() => {
    let active = true;

    async function loadRole(user: User | null, session: Session | null) {
      if (!user) {
        if (active)
          setState({ loading: false, user: null, session: null, role: null, fullName: "" });
        return;
      }
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      if (!active) return;
      setState({
        loading: false,
        user,
        session,
        role: (roles?.role as Role) ?? null,
        fullName: profile?.full_name ?? "",
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      // Defer DB calls to avoid recursion in callback
      setTimeout(() => {
        loadRole(session?.user ?? null, session);
      }, 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      loadRole(data.session?.user ?? null, data.session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
