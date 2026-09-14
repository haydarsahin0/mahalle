-- Profiles are editable only for display names; monetary fields and entitlements are service-owned.
revoke update on public.profiles from authenticated;
grant update(name) on public.profiles to authenticated;
