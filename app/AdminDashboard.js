"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import ThemeToggle from "./ThemeToggle";

const formatDate = (value) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—";
const emptyRow = (columns) => <tr><td className="empty" colSpan={columns}>Nothing to show yet.</td></tr>;

export default function AdminDashboard({ adminName, initialMedia, initialProfiles, initialVotes, initialPromptChains, initialPromptChainSteps, promptChainsError, promptChainStepsError, initialLlmModels, llmModelsError, initialMemeImages, memeImagesError }) {
  const router = useRouter();
  const [view, setView] = useState("overview");
  const [media, setMedia] = useState(initialMedia);
  const [profiles] = useState(initialProfiles);
  const [votes] = useState(initialVotes);
  const [promptChains, setPromptChains] = useState(initialPromptChains);
  const [promptChainSteps] = useState(initialPromptChainSteps);
  const [llmModels, setLlmModels] = useState(initialLlmModels);
  const [memeImages, setMemeImages] = useState(initialMemeImages);
  const [editing, setEditing] = useState(null);
  const [editingChainMix, setEditingChainMix] = useState(null);
  const [editingLlmModel, setEditingLlmModel] = useState(null);
  const [editingMemeImage, setEditingMemeImage] = useState(null);
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
    promptChainSteps: ["Prompt chain steps", "Read-only ordered steps from meme_prompt_chain_steps."],
    promptChainMix: ["Prompt chain mix", "Review and update existing caption-style mix records."],
    llmModels: ["LLM providers/models", "Manage provider and model records."],
    memeImages: ["Meme images", "Manage images in meme_photos and user_meme_photos."],
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

  async function saveChainMix(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    let payload;
    try { payload = JSON.parse(new FormData(event.currentTarget).get("payload")); }
    catch { setSaving(false); setMessage("Mix details must be valid JSON."); return; }
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    const { data, error } = await createClient().from("meme_caption_styles").update(payload).eq("id", editingChainMix.id).select().single();
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setPromptChains((current) => current.map((item) => item.id === data.id ? data : item));
    setEditingChainMix(null);
  }

  async function saveLlmModel(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    let payload;
    try { payload = JSON.parse(new FormData(event.currentTarget).get("payload")); }
    catch { setSaving(false); setMessage("Model details must be valid JSON."); return; }
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    const result = editingLlmModel?.id
      ? await createClient().from("llm_models").update(payload).eq("id", editingLlmModel.id).select().single()
      : await createClient().from("llm_models").insert(payload).select().single();
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    setLlmModels((current) => editingLlmModel?.id ? current.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...current]);
    setEditingLlmModel(null);
  }

  async function deleteLlmModel(model) {
    if (!window.confirm(`Delete ${model.name || model.model_name || model.id} permanently?`)) return;
    const { error } = await createClient().from("llm_models").delete().eq("id", model.id);
    if (error) { setMessage(error.message); return; }
    setLlmModels((current) => current.filter((item) => item.id !== model.id));
  }

  async function saveMemeImage(event) {
    event.preventDefault();
    setSaving(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const bucket = editingMemeImage?.bucket || form.get("bucket");
    if (!file?.size) { setSaving(false); setMessage("Choose an image file first."); return; }
    const requestedPath = form.get("path")?.trim();
    const path = editingMemeImage?.path || requestedPath || `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const { error } = await createClient().storage.from(bucket).upload(path, file, { contentType: file.type, upsert: Boolean(editingMemeImage) });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    const storage = createClient().storage.from(bucket);
    const { data: signed } = await storage.createSignedUrl(path, 3600);
    const image = { ...(editingMemeImage || {}), id: `${bucket}:${path}`, name: path.split("/").pop(), bucket, path, url: signed?.signedUrl ?? storage.getPublicUrl(path).data.publicUrl, metadata: { mimetype: file.type, size: file.size } };
    setMemeImages((current) => editingMemeImage ? current.map((item) => item.bucket === bucket && item.path === path ? image : item) : [image, ...current]);
    setEditingMemeImage(null);
  }

  async function deleteMemeImage(image) {
    if (!window.confirm(`Delete ${image.name} permanently?`)) return;
    const { error } = await createClient().storage.from(image.bucket).remove([image.path]);
    if (error) { setMessage(error.message); return; }
    setMemeImages((current) => current.filter((item) => !(item.bucket === image.bucket && item.path === image.path)));
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
      <nav aria-label="Admin navigation">{Object.keys(labels).map((key) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{key === "media" ? "AI media" : key === "people" ? "People" : key === "votes" ? "Vote ledger" : key === "promptChainSteps" ? "Chain steps" : key === "promptChainMix" ? "Chain mix" : key === "llmModels" ? "LLM providers/models" : key === "memeImages" ? "Meme images" : "Overview"}</button>)}</nav>
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
      {view === "promptChainSteps" && <><ChainStepAnalytics rows={promptChainSteps} /><ReadTable title="Prompt chain steps" rows={promptChainSteps} error={promptChainStepsError} /></>}
      {view === "promptChainMix" && <MixTable rows={promptChains} error={promptChainsError} onEdit={(item) => { setMessage(""); setEditingChainMix(item); }} />}
      {view === "llmModels" && <LlmModelsTable rows={llmModels} error={llmModelsError} onCreate={() => { setMessage(""); setEditingLlmModel({}); }} onEdit={(model) => { setMessage(""); setEditingLlmModel(model); }} onDelete={deleteLlmModel} />}
      {view === "memeImages" && <MemeImagesTable images={memeImages} error={memeImagesError} onCreate={() => { setMessage(""); setEditingMemeImage({}); }} onEdit={(image) => { setMessage(""); setEditingMemeImage(image); }} onDelete={deleteMemeImage} />}
    </section>
    {editing && <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={saveMedia}><p className="eyebrow">Generation record</p><h2>{editing.id ? "Edit generation" : "New AI media"}</h2><label>Prompt<input name="prompt_text" defaultValue={editing.prompt_text || ""} /></label><label>Content / caption<input name="content_text" required defaultValue={editing.content_text || ""} /></label><label>Image URL<input name="image_url" type="url" required defaultValue={editing.image_url || ""} /></label>{editing.id && <div className="vote-summary" aria-label="Read-only community votes"><span>Community votes</span><strong>↑ {editing.upvotes || 0} <i>upvotes</i></strong><strong>↓ {editing.downvotes || 0} <i>downvotes</i></strong></div>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save record"}</button></div></form></div>}
    {viewingVotesFor && <VoteModal generation={viewingVotesFor} votes={votes.filter((vote) => vote.generation_id === viewingVotesFor.id)} profiles={profileById} onClose={() => setViewingVotesFor(null)} />}
    {editingChainMix && <ChainMixModal item={editingChainMix} saving={saving} onClose={() => setEditingChainMix(null)} onSave={saveChainMix} />}
    {editingLlmModel && <LlmModelModal item={editingLlmModel} saving={saving} onClose={() => setEditingLlmModel(null)} onSave={saveLlmModel} />}
    {editingMemeImage && <MemeImageModal image={editingMemeImage} saving={saving} onClose={() => setEditingMemeImage(null)} onSave={saveMemeImage} />}
  </main>;
}

function Stat({ label, value, note, dark, violet }) { return <article className={`stat ${dark ? "dark" : ""} ${violet ? "violet" : ""}`}><p className="eyebrow">{label}</p><strong>{value}</strong><small>{note}</small></article>; }
function ChainStepAnalytics({ rows }) {
  const modelCounts = rows.reduce((counts, row) => { const model = llmUsed(row); if (model !== "—") counts[model] = (counts[model] || 0) + 1; return counts; }, {});
  const topModel = Object.entries(modelCounts).sort(([, a], [, b]) => b - a)[0];
  const chainIds = new Set(rows.map((row) => row.prompt_chain_id || row.meme_caption_style_id || row.chain_id || row.caption_style_id).filter(Boolean));
  return <div className="stats compact-stats"><Stat label="Total steps" value={rows.length} note="Configured prompt steps" /><Stat label="Prompt chains" value={chainIds.size || "—"} note="Chains represented here" dark /><Stat label="Most-used model" value={topModel?.[0] || "—"} note={topModel ? `${topModel[1]} step${topModel[1] === 1 ? "" : "s"}` : "No model recorded"} violet /><Stat label="Models used" value={Object.keys(modelCounts).length} note="Distinct LLMs" /></div>;
}
function PanelHead({ title, detail, action }) { return <header className="panel-head"><h2>{title}</h2>{action || <span className="muted">{detail}</span>}</header>; }
function Table({ headings, children }) { return <div className="table-wrap"><table><thead><tr>{headings.map((heading, index) => <th key={index}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

function ReadTable({ title, rows, error }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at", "llm", "llm_used", "llm_model", "llm_model_id", "model", "model_id"].includes(column)).slice(0, 6); return <section className="panel"><PanelHead title={title} detail="Read-only" />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...(columns.length ? columns : ["Record"]), "LLM used"]}>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}<td>{llmUsed(row)}</td></tr>)}{!rows.length && emptyRow(Math.max(2, columns.length + 1))}</Table>}</section>; }
function MixTable({ rows, error, onEdit }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at", "llm", "llm_used", "llm_model", "llm_model_id", "model", "model_id"].includes(column)).slice(0, 5); return <section className="panel"><PanelHead title="Prompt chain mix" detail="Update existing records" />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...columns, "LLM used", ""]}>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}<td>{llmUsed(row)}</td><td className="row-actions"><button onClick={() => onEdit(row)}>Edit mix</button></td></tr>)}{!rows.length && emptyRow(columns.length + 2)}</Table>}</section>; }
function formatCell(value) { return value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value); }
function llmUsed(row) { const value = row.llm_used || row.llm || row.llm_model || row.model || row.llm_model_id || row.model_id; return typeof value === "object" ? value.name || value.display_name || value.model_name || value.id || "—" : formatCell(value); }
function ChainMixModal({ item, saving, onClose, onSave }) { const initialValue = JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => !["id", "created_at", "updated_at"].includes(key))), null, 2); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">Prompt chain mix</p><h2>Update mix</h2><label>Mix details (JSON)<textarea name="payload" defaultValue={initialValue} required spellCheck="false" /></label><p className="form-note">Only existing records can be updated here. IDs and timestamps are preserved automatically.</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save mix"}</button></div></form></div>; }
function LlmModelsTable({ rows, error, onCreate, onEdit, onDelete }) { const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !["id", "created_at", "updated_at"].includes(column)).slice(0, 6); return <section className="panel"><PanelHead title="LLM providers/models" action={<button className="primary compact" onClick={onCreate}>+ New record</button>} />{error ? <p className="form-note">Could not load this table: {error}</p> : <Table headings={[...(columns.length ? columns : ["Record"]), ""]}>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}<td className="row-actions"><button onClick={() => onEdit(row)}>Edit</button><button className="danger" onClick={() => onDelete(row)}>Delete</button></td></tr>)}{!rows.length && emptyRow(Math.max(2, columns.length + 1))}</Table>}</section>; }
function LlmModelModal({ item, saving, onClose, onSave }) { const initialValue = JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => !["id", "created_at", "updated_at"].includes(key))), null, 2); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">LLM model</p><h2>{item.id ? "Edit model" : "New model"}</h2><label>Model details (JSON)<textarea name="payload" defaultValue={initialValue} required spellCheck="false" /></label><p className="form-note">IDs and timestamps are managed automatically.</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save model"}</button></div></form></div>; }
function MemeImagesTable({ images, error, onCreate, onEdit, onDelete }) { return <section className="panel"><PanelHead title="Meme images" action={<button className="primary compact" onClick={onCreate}>+ Upload image</button>} />{error && <p className="form-note">Some images could not be loaded: {error}</p>}<div className="image-grid">{images.map((image) => <article className="image-card" key={`${image.bucket}:${image.path}`}><img src={image.url} alt={image.name} /><div><b>{image.name}</b><small>{image.bucket}</small><small>{image.metadata?.mimetype || "image"} · {image.metadata?.size ? `${Math.ceil(image.metadata.size / 1024)} KB` : "—"}</small><p><button onClick={() => onEdit(image)}>Replace</button><button className="danger" onClick={() => onDelete(image)}>Delete</button></p></div></article>)}{!images.length && <p className="empty">No images found in either bucket.</p>}</div></section>; }
function MemeImageModal({ image, saving, onClose, onSave }) { const isReplacing = Boolean(image.path); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={onSave}><p className="eyebrow">Meme image</p><h2>{isReplacing ? "Replace image" : "Upload image"}</h2>{!isReplacing && <><label>Bucket<select name="bucket" defaultValue="meme_photos"><option value="meme_photos">meme_photos</option><option value="user_meme_photos">user_meme_photos</option></select></label><label>Optional storage path<input name="path" placeholder="e.g. featured/my-meme.png" /></label></>}<label>Image file<input name="file" type="file" accept="image/*" required /></label><p className="form-note">{isReplacing ? `This replaces ${image.path} in ${image.bucket}.` : "Leave the path empty to generate a unique filename."}</p><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : isReplacing ? "Replace image" : "Upload image"}</button></div></form></div>; }

function VoteModal({ generation, votes, profiles, onClose }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="votes-title"><section className="modal votes-modal"><p className="eyebrow">Community activity</p><h2 id="votes-title">Votes on this generation</h2><p className="vote-caption">{generation.content_text || generation.prompt_text || "Untitled generation"}</p><ul className="voter-list">{votes.map((vote) => {
    const profile = profiles[vote.user_id];
    const name = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || `${vote.user_id.slice(0, 8)}…`;
    return <li key={`${vote.generation_id}-${vote.user_id}`}><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span>{name}<small>{profile?.email && profile.display_name ? profile.email : ""}</small></span><b className={vote.vote > 0 ? "positive" : "negative"}>{vote.vote > 0 ? "↑ Upvote" : "↓ Downvote"}</b></li>;
  })}{!votes.length && <li className="empty">No one has voted on this generation yet.</li>}</ul><div className="modal-actions"><button className="secondary" onClick={onClose}>Close</button></div></section></div>;
}
