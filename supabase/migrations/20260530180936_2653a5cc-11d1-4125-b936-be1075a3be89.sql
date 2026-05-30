revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;


CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
    VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.email,''));
  v_role := coalesce(nullif(new.raw_user_meta_data->>'role',''), 'attendee')::public.app_role;
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
