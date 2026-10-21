import { redirect } from "next/navigation";
import { createClient } from "../utils/supabase/server";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_superadmin) redirect("/access-denied");

  const [mediaResult, profilesResult, votesResult] = await Promise.all([
    supabase.from("ai_generations").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("meme_votes").select("*").order("created_at", { ascending: false }),
  ]);

  return <AdminDashboard
    adminName={profile.display_name || profile.email || user.email}
    initialMedia={mediaResult.data ?? []}
    initialProfiles={profilesResult.data ?? []}
    initialVotes={votesResult.data ?? []}
  />;
}
