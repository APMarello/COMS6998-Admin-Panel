"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import ThemeToggle from "./ThemeToggle";

const formatDate = (value) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—";
const emptyRow = (columns) => <tr><td className="empty" colSpan={columns}>Nothing to show yet.</td></tr>;

export default function AdminDashboard({ adminName, initialMedia, initialProfiles, initialVotes }) {
  const router = useRouter();
  const [view, setView] = useState("overview");
  const [media, setMedia] = useState(initialMedia);
  const [profiles] = useState(initialProfiles);
  const [votes] = useState(initialVotes);
  const [editing, setEditing] = useState(null);
  const [viewingVotesFor, setViewingVotesFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const totals = useMemo(() => {
    const up = media.reduce((sum, item) => sum + (item.upvotes || 0), 0);
    const down = media.reduce((sum, item) => sum + (item.downvotes || 0), 0);
    return { up, down, approval: up + down ? Math.round((up / (up + down)) * 100) : 0 };
  }, [media]);
  const profileById = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const mediaById = useMemo(() => Object.fromEntries(media.map((item) => [item.id, item])), [media]);
  const labels = {
    overview: ["The room at a glance", "Signals from the creative community."],
    media: ["Shape the gallery", "Create, correct, or retire AI-generated media."],
    people: ["Know the audience", "Read-only profile directory and roles."],
    votes: ["Every signal counts", "Read-only record of upvotes and downvotes."],
  };

  async function saveMedia(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      prompt_text: form.get("prompt_text") || null,
      content_text: form.get("content_text"),
      image_url: form.get("image_url"),
    };
    if (!editing?.id) {
      payload.upvotes = 0;
      payload.downvotes = 0;
    }
    const supabase = createClient();
    const result = editing
      ? await supabase.from("ai_generations").update(payload).eq("id", editing.id).select().single()
      : await supabase.from("ai_generations").insert(payload).select().single();
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    setMedia((current) => editing ? current.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...current]);
    setEditing(null);
  }

  async function deleteMedia(id) {
    if (!window.confirm("Delete this generation permanently?")) return;
    const { error } = await createClient().from("ai_generations").delete().eq("id", id);
    if (error) { setMessage(error.message); return; }
    setMedia((current) => current.filter((item) => item.id !== id));
  }

  async function signOut() { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }

  const dailyCounts = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - 6 + index);
    return { day, count: media.filter((item) => new Date(item.created_at).toDateString() === day.toDateString()).length };
  });
  const maxCount = Math.max(1, ...dailyCounts.map((entry) => entry.count));

  return <main className="admin-shell">
    <aside className="sidebar">
      <div className="brand">AI Humor App<small>ADMIN STUDIO</small></div>
      <nav aria-label="Admin navigation">{Object.keys(labels).map((key) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{key === "media" ? "AI media" : key === "people" ? "People" : key === "votes" ? "Vote ledger" : "Overview"}</button>)}</nav>
      <div className="account"><span>{adminName}</span><button onClick={signOut}>Sign out</button></div>
    </aside>
    <section className="admin-content">
      <header className="top"><div><p className="eyebrow">Realtime snapshot</p><h1>{labels[view][0]}</h1><p className="muted">{labels[view][1]}</p></div><div className="header-actions"><span className="admin-pill">● Superadmin session</span><ThemeToggle /></div></header>
      {message && <p className="error">{message}</p>}
      {view === "overview" && <>
        <div className="stats">
          <Stat label="Generations" value={media.length} note="All-time creative artifacts" />
          <Stat label="Community pulse" value={`${totals.approval}%`} note="positive reaction rate" dark />
          <Stat label="People" value={profiles.length} note="profiles in the room" violet />
          <Stat label="Vote volume" value={votes.length} note="individual decisions" />
        </div>
        <div className="overview-grid"><section className="panel"><PanelHead title="Creation cadence" detail="last 7 days" /><div className="chart">{dailyCounts.map(({ day, count }) => <div key={day} className="chart-bar" title={`${count} creations on ${day.toLocaleDateString()}`} style={{ height: `${22 + (count / maxCount) * 170}px` }} />)}</div></section>
          <section className="panel"><PanelHead title="Most loved" detail="↗" /><ul className="loved-list">{media.slice().sort((a, b) => ((b.upvotes || 0) - (b.downvotes || 0)) - ((a.upvotes || 0) - (a.downvotes || 0))).slice(0, 5).map((item) => <li key={item.id}><span>{item.content_text || item.prompt_text || "Untitled"}</span><b>+{(item.upvotes || 0) - (item.downvotes || 0)}</b></li>)}{!media.length && <li className="empty">No media yet.</li>}</ul></section>
        </div>
      </>}
      {view === "media" && <section className="panel"><PanelHead title="AI-generated media" action={<button className="primary compact" onClick={() => { setMessage(""); setEditing({}); }}>+ New generation</button>} /><Table headings={["Media", "Prompt", "Created", "Reaction", ""]}>{media.map((item) => <tr key={item.id}><td><img className="media-thumb" src={item.image_url} alt="" /></td><td>{item.prompt_text || item.content_text}</td><td>{formatDate(item.created_at)}</td><td>↑ {item.upvotes || 0}&nbsp; ↓ {item.downvotes || 0}</td><td className="row-actions"><button onClick={() => setViewingVotesFor(item)}>Votes</button><button onClick={() => { setMessage(""); setEditing(item); }}>Edit</button><button className="danger" onClick={() => deleteMedia(item.id)}>Delete</button></td></tr>)}{!media.length && emptyRow(5)}</Table></section>}
      {view === "people" && <section className="panel"><PanelHead title="Profiles" detail="Read-only directory" /><Table headings={["Person", "Email", "Joined", "Role"]}>{profiles.map((profile) => <tr key={profile.id}><td><span className="avatar">{(profile.display_name || profile.email || "?").slice(0, 1).toUpperCase()}</span>{profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unnamed"}</td><td>{profile.email}</td><td>{formatDate(profile.created_at)}</td><td>{profile.is_superadmin ? <span className="admin-pill">SUPERADMIN</span> : <span className="muted">Member</span>}</td></tr>)}{!profiles.length && emptyRow(4)}</Table></section>}
      {view === "votes" && <section className="panel"><PanelHead title="Vote ledger" detail="Read-only audit trail" /><Table headings={["Generation", "Voter", "Vote", "When"]}>{votes.map((vote) => <tr key={`${vote.generation_id}-${vote.user_id}`}><td>{mediaById[vote.generation_id]?.content_text || mediaById[vote.generation_id]?.prompt_text || `${vote.generation_id.slice(0, 8)}…`}</td><td>{profileById[vote.user_id]?.display_name || profileById[vote.user_id]?.email || `${vote.user_id.slice(0, 8)}…`}</td><td className={vote.vote > 0 ? "positive" : "negative"}>{vote.vote > 0 ? "↑ Upvote" : "↓ Downvote"}</td><td>{formatDate(vote.created_at)}</td></tr>)}{!votes.length && emptyRow(4)}</Table></section>}
    </section>
    {editing && <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={saveMedia}><p className="eyebrow">Generation record</p><h2>{editing.id ? "Edit generation" : "New AI media"}</h2><label>Prompt<input name="prompt_text" defaultValue={editing.prompt_text || ""} /></label><label>Content / caption<input name="content_text" required defaultValue={editing.content_text || ""} /></label><label>Image URL<input name="image_url" type="url" required defaultValue={editing.image_url || ""} /></label>{editing.id && <div className="vote-summary" aria-label="Read-only community votes"><span>Community votes</span><strong>↑ {editing.upvotes || 0} <i>upvotes</i></strong><strong>↓ {editing.downvotes || 0} <i>downvotes</i></strong></div>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save record"}</button></div></form></div>}
    {viewingVotesFor && <VoteModal generation={viewingVotesFor} votes={votes.filter((vote) => vote.generation_id === viewingVotesFor.id)} profiles={profileById} onClose={() => setViewingVotesFor(null)} />}
  </main>;
}

function Stat({ label, value, note, dark, violet }) { return <article className={`stat ${dark ? "dark" : ""} ${violet ? "violet" : ""}`}><p className="eyebrow">{label}</p><strong>{value}</strong><small>{note}</small></article>; }
function PanelHead({ title, detail, action }) { return <header className="panel-head"><h2>{title}</h2>{action || <span className="muted">{detail}</span>}</header>; }
function Table({ headings, children }) { return <div className="table-wrap"><table><thead><tr>{headings.map((heading, index) => <th key={index}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

function VoteModal({ generation, votes, profiles, onClose }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="votes-title"><section className="modal votes-modal"><p className="eyebrow">Community activity</p><h2 id="votes-title">Votes on this generation</h2><p className="vote-caption">{generation.content_text || generation.prompt_text || "Untitled generation"}</p><ul className="voter-list">{votes.map((vote) => {
    const profile = profiles[vote.user_id];
    const name = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || `${vote.user_id.slice(0, 8)}…`;
    return <li key={`${vote.generation_id}-${vote.user_id}`}><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span>{name}<small>{profile?.email && profile.display_name ? profile.email : ""}</small></span><b className={vote.vote > 0 ? "positive" : "negative"}>{vote.vote > 0 ? "↑ Upvote" : "↓ Downvote"}</b></li>;
  })}{!votes.length && <li className="empty">No one has voted on this generation yet.</li>}</ul><div className="modal-actions"><button className="secondary" onClick={onClose}>Close</button></div></section></div>;
}
