"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, CheckCircle2, ChevronRight, Copy, Eye, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { accessRoles, canManageMember, initials, roleDetails, roleNeedsConcept, type AccessContext, type AccessRole, type TeamMember } from "@/lib/access-control";
import { PageHeader } from "@/components/ui/baseline";

const demoConcepts = [{ id: "waterfront-iloilo", name: "Waterfront · Iloilo" }];
const initialMembers: TeamMember[] = [
  { id: "current-user", fullName: "Account Owner", email: "owner@waterfrontiloilo.com", username: "account.owner", role: "superadmin", conceptIds: [], conceptName: "All concepts", active: true, lastActive: "Active now", version: 1 },
  { id: "owner-demo", fullName: "Isabel Tan", email: "isabel@waterfrontiloilo.com", username: "isabel.tan", role: "owner", conceptIds: [], conceptName: "All concepts", active: true, lastActive: "Today, 8:42 AM", version: 1 },
  { id: "manager-demo", fullName: "Mika Reyes", email: "mika@waterfrontiloilo.com", username: "mika.reyes", role: "manager", conceptIds: ["waterfront-iloilo"], conceptName: "Waterfront · Iloilo", active: true, lastActive: "Today, 7:58 AM", version: 1 },
  { id: "staff-demo", fullName: "Paolo Cruz", email: "paolo@waterfrontiloilo.com", username: "paolo.cruz", role: "staff", conceptIds: ["waterfront-iloilo"], conceptName: "Waterfront · Iloilo", active: true, lastActive: "Yesterday, 9:15 PM", version: 1 },
];

type MemberForm = { fullName: string; email: string; username: string; role: AccessRole; conceptIds: string[] };
const emptyForm: MemberForm = { fullName: "", email: "", username: "", role: "staff", conceptIds: ["waterfront-iloilo"] };

function ActionButton({ children, onClick, tone = "primary", type = "button", disabled = false }: { children: React.ReactNode; onClick?: () => void; tone?: "primary" | "outline" | "danger"; type?: "button" | "submit"; disabled?: boolean }) {
  const styles = tone === "primary" ? "border border-transparent bg-primary text-primary-foreground hover:bg-primary-strong" : tone === "danger" ? "border border-danger/25 bg-card text-danger hover:bg-danger-soft" : "border border-border bg-card text-foreground hover:bg-secondary";
  return <button type={type} disabled={disabled} onClick={onClick} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-45 ${styles}`}>{children}</button>;
}

function RoleBadge({ role }: { role: AccessRole }) {
  const styles: Record<AccessRole, string> = { superadmin: "bg-[var(--primary-strong)] text-white", owner: "bg-[var(--accent-soft)] text-[var(--accent-strong)]", manager: "bg-[var(--primary-soft)] text-[var(--primary)]", staff: "bg-[#eef0f3] text-[var(--muted-foreground)]" };
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-semibold ${styles[role]}`}>{roleDetails[role].label}</span>;
}

export function TeamAccessWorkspace({ actor, notify }: { actor: AccessContext; notify: (message: string) => void }) {
  const [members, setMembers] = useState(initialMembers);
  const [conceptOptions, setConceptOptions] = useState(demoConcepts);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AccessRole | "all">("all");
  const [editing, setEditing] = useState<TeamMember | "new" | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [adminActionsAvailable, setAdminActionsAvailable] = useState(true);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [temporaryCredential, setTemporaryCredential] = useState<{ fullName: string; username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/members", { headers: { Accept: "application/json" } }).then(async (response) => {
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
      const data = await response.json() as { members?: TeamMember[]; concepts?: Array<{ id: string; name: string }>; adminActionsAvailable?: boolean };
      if (!cancelled && Array.isArray(data.members)) {
        const liveConcepts = Array.isArray(data.concepts) ? data.concepts : [];
        setMembers(data.members);
        setConceptOptions(liveConcepts);
        setAdminActionsAvailable(data.adminActionsAvailable !== false);
        setLiveMode(true);
        setForm((current) => {
          const validIds = new Set(liveConcepts.map((concept) => concept.id));
          const retainedIds = current.conceptIds.filter((id) => validIds.has(id));
          if (retainedIds.length === current.conceptIds.length) return current;
          return { ...current, conceptIds: retainedIds.length ? retainedIds : liveConcepts[0]?.id ? [liveConcepts[0].id] : [] };
        });
      }
    }).catch(() => { /* The safe demo directory remains visible until admin credentials are configured. */ }).finally(() => {
      if (!cancelled) setDirectoryLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => members.filter((member) => {
    const matchesText = `${member.fullName} ${member.email} ${member.username} ${member.conceptName}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (roleFilter === "all" || member.role === roleFilter);
  }), [members, query, roleFilter]);

  function openMember(member?: TeamMember) {
    if (member) {
      setEditing(member);
      setForm({ fullName: member.fullName, email: member.email, username: member.username, role: member.role, conceptIds: member.conceptIds });
    } else {
      setEditing("new");
      setForm({ ...emptyForm, conceptIds: conceptOptions[0]?.id ? [conceptOptions[0].id] : [] });
    }
  }

  function changeRole(role: AccessRole) {
    setForm((current) => ({ ...current, role, conceptIds: roleNeedsConcept(role) ? current.conceptIds.length ? current.conceptIds : conceptOptions[0]?.id ? [conceptOptions[0].id] : [] : [] }));
  }

  function toggleConcept(conceptId: string) {
    setForm((current) => {
      if (current.role === "staff") return { ...current, conceptIds: [conceptId] };
      return { ...current, conceptIds: current.conceptIds.includes(conceptId) ? current.conceptIds.filter((id) => id !== conceptId) : [...current.conceptIds, conceptId] };
    });
  }

  function conceptSummary(conceptIds: string[]) {
    if (!conceptIds.length) return "All concepts";
    return conceptIds.map((id) => conceptOptions.find((concept) => concept.id === id)?.name ?? "Assigned concept").join(", ");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (liveMode && !adminActionsAvailable) return notify("Admin actions are not configured. Add a server-only Supabase secret before inviting members.");
    if (!form.fullName.trim() || !form.email.trim() || !form.username.trim() || (form.role === "manager" && form.conceptIds.length === 0) || (form.role === "staff" && form.conceptIds.length !== 1)) return notify("Complete the member details and choose the required concept access.");
    if (liveMode && roleNeedsConcept(form.role) && form.conceptIds.some((id) => !conceptOptions.some((concept) => concept.id === id))) return notify("Choose an active concept before sending the invite.");
    setSaving(true);
    try {
      if (liveMode) {
        const isNew = editing === "new";
        const response = await fetch(isNew ? "/api/admin/members" : `/api/admin/members/${(editing as TeamMember).id}`, {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isNew ? form : { ...form, version: (editing as TeamMember).version }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Member update failed.");
        window.location.reload();
        return;
      }

      if (editing === "new") {
        setMembers((current) => [...current, { id: crypto.randomUUID(), ...form, conceptName: conceptSummary(form.conceptIds), active: true, lastActive: "Invitation pending", version: 1 }]);
        notify(`Invitation prepared for ${form.email}. Connect the server secret to send live invitations.`);
      } else if (editing) {
        setMembers((current) => current.map((member) => member.id === editing.id ? { ...member, ...form, conceptName: conceptSummary(form.conceptIds), version: member.version + 1 } : member));
        notify(`${form.fullName}'s access was updated and added to the audit trail preview.`);
      }
      setEditing(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The member action could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(member: TeamMember) {
    if (!canManageMember(actor, member)) return notify("Your own Superadmin access cannot be removed here.");
    if (!window.confirm(`Deactivate ${member.fullName}? Their historical activity will remain in the audit trail.`)) return;
    if (liveMode) {
      const response = await fetch(`/api/admin/members/${member.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) return notify(result.error ?? "The member could not be deactivated.");
    }
    setMembers((current) => current.map((item) => item.id === member.id ? { ...item, active: false } : item));
    notify(`${member.fullName} was deactivated. Their audit history was retained.`);
  }

  async function resetPassword(member: TeamMember) {
    if (actor.role !== "superadmin" || !member.active) return notify("Only an active Superadmin can reset member passwords.");
    if (liveMode && !adminActionsAvailable) return notify("Admin actions are not configured. Add a server-only Supabase secret before resetting passwords.");
    const delivery = member.email ? `send a reset link to ${member.email}` : "generate a temporary password for this member";
    if (!window.confirm(`Reset ${member.fullName}'s password and ${delivery}?`)) return;
    setResettingId(member.id);
    try {
      const response = await fetch(`/api/admin/members/${member.id}/password-reset`, { method: "POST", headers: { Accept: "application/json" } });
      const result = await response.json() as { error?: string; method?: "email" | "temporary_password"; email?: string; username?: string; temporaryPassword?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "The password reset could not be completed.");
      if (result.method === "temporary_password" && result.temporaryPassword) {
        setCopied(false);
        setTemporaryCredential({ fullName: member.fullName, username: result.username ?? member.username, password: result.temporaryPassword });
      } else {
        notify(result.message ?? "The reset link was sent.");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "The password reset could not be completed.");
    } finally {
      setResettingId(null);
    }
  }

  async function copyTemporaryPassword() {
    if (!temporaryCredential) return;
    try {
      await navigator.clipboard.writeText(temporaryCredential.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      notify("Copy was blocked by the browser. Select the temporary password and copy it securely.");
    }
  }

  return <div className="animate-rise">
    <PageHeader eyebrow="Identity & access" title="Team access" description="Control who can see and operate each Waterfront concept. Every change is scoped, versioned, and auditable."><ActionButton disabled={liveMode && !adminActionsAvailable} onClick={() => openMember()}><Plus size={17} />Add member</ActionButton></PageHeader>
    <div className="border-b border-border bg-card px-5 py-4 md:px-6">
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-xs ${liveMode && adminActionsAvailable ? "border-success/20 bg-success-soft text-success" : "border-warning/25 bg-warning-soft text-warning"}`}><ShieldCheck size={17} /><b>{liveMode ? adminActionsAvailable ? "Live access control" : "Directory connected · admin actions paused" : "Protected preview"}</b><span className="text-[var(--muted-foreground)]">{liveMode ? adminActionsAvailable ? "Connected to Supabase Auth and RLS." : "Add a server-only Supabase secret to enable invitations, resets, and access changes." : "The production invitation path activates after a server-only Supabase secret is configured."}</span></div>
    </div>

    <div className="px-5 py-6 md:px-8">
      <div className="grid gap-3 lg:grid-cols-4">{accessRoles.map((role) => <article key={role} className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between"><RoleBadge role={role} />{role === "superadmin" ? <KeyRound size={17} className="text-[var(--accent-strong)]" /> : role === "owner" ? <Eye size={17} className="text-[var(--accent-strong)]" /> : <UserRound size={17} className="text-[var(--primary)]" />}</div>
        <p className="mt-4 min-h-12 text-sm leading-5 text-[var(--muted-foreground)]">{roleDetails[role].summary}</p><div className="mt-4 border-t border-border pt-3 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]">{roleDetails[role].scope}</div>
      </article>)}</div>

      <section className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <div><h2 className="font-display text-2xl text-[var(--foreground)]">Members</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">{members.filter((member) => member.active).length} active members · {members.filter((member) => !member.active).length} deactivated</p></div>
          <div className="flex flex-col gap-2 sm:flex-row"><label className="flex h-11 min-w-[240px] items-center gap-2 rounded-lg border border-black/10 bg-[var(--background)] px-3"><Search size={16} className="text-[var(--muted-foreground)]" /><input aria-label="Search members" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, username or concept" className="w-full bg-transparent text-sm outline-none" /></label><select aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as AccessRole | "all")} className="h-11 rounded-lg border border-black/10 bg-card px-3 text-sm"><option value="all">All roles</option>{accessRoles.map((role) => <option key={role} value={role}>{roleDetails[role].label}</option>)}</select></div>
        </div>
        <div className="divide-y divide-black/[.06]">{filtered.map((member) => <div key={member.id} className={`grid gap-4 p-4 sm:grid-cols-[minmax(240px,1fr)_150px_minmax(150px,.7fr)_auto] sm:items-center ${member.active ? "" : "bg-[var(--background)] opacity-55"}`}>
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary-strong)] text-xs font-bold text-white">{initials(member.fullName)}</div><div className="min-w-0"><div className="truncate text-sm font-bold text-[#293c38]">{member.fullName}{member.id === "current-user" && <span className="ml-2 text-[9px] font-bold uppercase tracking-wide text-[var(--accent-strong)]">You</span>}</div><div className="truncate text-xs text-[var(--muted-foreground)]">@{member.username} · {member.email || "No email on file"}</div></div></div>
          <div><RoleBadge role={member.role} /></div><div><div className="text-xs font-semibold text-[#4d5e5a]">{member.conceptName}</div><div className="mt-1 text-[10px] text-[#929a98]">{member.active ? member.lastActive : "Access deactivated"}</div></div>
          <div className="flex justify-end gap-1"><button aria-label={`Reset password for ${member.fullName}`} title={member.email ? "Send password reset email" : "Generate temporary password"} disabled={!member.active || actor.role !== "superadmin" || resettingId === member.id || (liveMode && !adminActionsAvailable)} onClick={() => void resetPassword(member)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-soft)] px-2.5 py-2 text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] disabled:opacity-25">{resettingId === member.id ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" /> : <KeyRound size={16} />}<span className="hidden xl:inline">Reset</span></button><button aria-label={`Edit ${member.fullName}`} disabled={!member.active || !canManageMember(actor, member) || (liveMode && !adminActionsAvailable)} onClick={() => openMember(member)} className="rounded-full p-2.5 text-[#5c6966] hover:bg-secondary disabled:opacity-25"><Pencil size={16} /></button><button aria-label={`Deactivate ${member.fullName}`} disabled={!member.active || !canManageMember(actor, member) || (liveMode && !adminActionsAvailable)} onClick={() => void deactivate(member)} className="rounded-full p-2.5 text-red-500 hover:bg-red-50 disabled:opacity-25"><Trash2 size={16} /></button><button aria-label={`View ${member.fullName}`} className="rounded-full p-2.5 text-[#8a9492] hover:bg-secondary"><ChevronRight size={16} /></button></div>
        </div>)}</div>
      </section>
    </div>

    {editing && <div className="fixed inset-0 z-[70] bg-[var(--foreground)]/35" role="dialog" aria-modal="true" aria-labelledby="member-dialog-title"><button aria-label="Close member editor" onClick={() => setEditing(null)} className="absolute inset-0" /><aside className="absolute bottom-0 right-0 top-0 w-full max-w-[520px] overflow-y-auto bg-card shadow-2xl">
      <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card/95 px-6 py-5 backdrop-blur"><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--accent-strong)]">Superadmin control</div><h2 id="member-dialog-title" className="font-display mt-1 text-2xl text-[var(--foreground)]">{editing === "new" ? "Add a member" : "Modify access"}</h2></div><div className="flex items-center gap-2">{editing !== "new" && <button type="button" aria-label={`Reset password for ${(editing as TeamMember).fullName}`} title="Reset password" disabled={saving || resettingId === (editing as TeamMember).id || (liveMode && !adminActionsAvailable)} onClick={() => void resetPassword(editing as TeamMember)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] disabled:opacity-45"><KeyRound size={15} /><span className="hidden sm:inline">Reset password</span></button>}<button aria-label="Close" onClick={() => setEditing(null)} className="rounded-full border border-black/10 p-2"><X size={17} /></button></div></div>
      <form onSubmit={submit} className="p-6"><div className="space-y-5"><label className="block text-xs font-bold text-[var(--muted-foreground)]">Full name<input required value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} className="mt-2 h-12 w-full rounded-lg border border-black/10 px-4 text-sm font-normal outline-none" /></label><label className="block text-xs font-bold text-[var(--muted-foreground)]">Work email<input required disabled={editing !== "new"} type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 h-12 w-full rounded-lg border border-black/10 px-4 text-sm font-normal outline-none disabled:bg-[#f5f5f5]" /></label><label className="block text-xs font-bold text-[var(--muted-foreground)]">Username<input required minLength={3} maxLength={32} pattern="[A-Za-z][A-Za-z0-9._-]{2,31}" autoComplete="username" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value.toLowerCase() }))} placeholder="mika.reyes" className="mt-2 h-12 w-full rounded-lg border border-black/10 px-4 text-sm font-normal outline-none" /><span className="mt-1.5 block text-[10px] font-normal leading-4 text-[var(--muted-foreground)]">Used for sign-in. Password resets still require the work email.</span></label>
        <fieldset><legend className="text-xs font-bold text-[var(--muted-foreground)]">Role</legend><div className="mt-2 grid grid-cols-2 gap-2">{accessRoles.map((role) => <button type="button" key={role} onClick={() => changeRole(role)} className={`rounded-lg border p-3 text-left transition ${form.role === role ? "border-[var(--primary)] bg-[var(--accent-soft)]" : "border-black/10"}`}><span className="text-xs font-bold text-[var(--secondary-foreground)]">{roleDetails[role].label}</span><span className="mt-1 block text-[10px] leading-4 text-[var(--muted-foreground)]">{roleDetails[role].scope}</span>{form.role === role && <Check size={14} className="float-right -mt-6 text-[var(--accent-strong)]" />}</button>)}</div></fieldset>
        {roleNeedsConcept(form.role) && <fieldset><legend className="text-xs font-bold text-[var(--muted-foreground)]">Assigned {form.role === "manager" ? "concepts" : "concept"}</legend><p className="mt-1 text-[10px] leading-4 text-[var(--muted-foreground)]">{form.role === "manager" ? "Superadmins can grant a Manager access to one or more concepts." : "Staff access is limited to exactly one concept."}</p>{directoryLoading ? <p className="mt-3 rounded-lg bg-[var(--secondary)] p-3 text-xs text-[var(--muted-foreground)]">Loading active concepts…</p> : conceptOptions.length === 0 ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">No active concepts are configured yet. Add a concept before inviting this role.</p> : <div className="mt-2 space-y-2">{conceptOptions.map((concept) => { const selected = form.conceptIds.includes(concept.id); return <label key={concept.id} className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition ${selected ? "border-[var(--primary)] bg-[var(--accent-soft)]" : "border-black/10"}`}><span className="text-sm font-semibold text-[var(--secondary-foreground)]">{concept.name}</span><input type={form.role === "manager" ? "checkbox" : "radio"} name="concept-access" checked={selected} onChange={() => toggleConcept(concept.id)} className="h-4 w-4 accent-[var(--primary)]" /></label>; })}</div>}</fieldset>}
        <div className="rounded-lg bg-[var(--secondary)] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#334c47]"><ShieldCheck size={16} />Effective access</div><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{roleDetails[form.role].summary} {roleNeedsConcept(form.role) ? "Access is restricted to the assigned concept at the database level." : "This is a group-wide role."}</p></div>
      </div><div className="mt-8 flex flex-wrap items-center justify-between gap-2"><div>{editing !== "new" && <ActionButton tone="outline" disabled={saving || resettingId === (editing as TeamMember).id || (liveMode && !adminActionsAvailable)} onClick={() => void resetPassword(editing as TeamMember)}><KeyRound size={16} />{resettingId === (editing as TeamMember).id ? "Resetting…" : "Reset password"}</ActionButton>}</div><div className="ml-auto flex gap-2"><ActionButton tone="outline" onClick={() => setEditing(null)}>Cancel</ActionButton><ActionButton type="submit" disabled={saving || (liveMode && roleNeedsConcept(form.role) && (directoryLoading || conceptOptions.length === 0 || form.conceptIds.length === 0))}>{editing === "new" ? <><Plus size={16} />Send invite</> : <><Check size={16} />Save access</>}</ActionButton></div></div></form>
    </aside></div>}

    {temporaryCredential && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--foreground)]/45 p-5" role="dialog" aria-modal="true" aria-labelledby="temporary-password-title"><section className="w-full max-w-md rounded-lg bg-card p-7 shadow-2xl"><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><CheckCircle2 size={20} /></div><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--accent-strong)]">One-time credential</div><h2 id="temporary-password-title" className="font-display mt-1 text-2xl text-[var(--foreground)]">Temporary password ready</h2></div></div><p className="mt-5 text-sm leading-6 text-[#596a66]">No email is on file for {temporaryCredential.fullName}. Give this password to the user through a secure channel and ask them to change it from Profile after signing in.</p><div className="mt-5 rounded-lg bg-[var(--secondary)] p-4"><div className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">Username</div><div className="mt-1 text-sm font-semibold text-[var(--secondary-foreground)]">@{temporaryCredential.username}</div><div className="mt-4 text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">Temporary password</div><div className="mt-2 flex items-center gap-2"><input aria-label="Temporary password" readOnly value={temporaryCredential.password} className="min-w-0 flex-1 rounded-lg border border-black/10 bg-card px-3 py-2.5 font-mono text-sm text-[var(--foreground)] outline-none" /><button type="button" onClick={() => void copyTemporaryPassword()} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-black/10 bg-card px-3 text-xs font-semibold text-[var(--secondary-foreground)] hover:border-[var(--primary)]">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div></div><div className="mt-6 flex justify-end"><ActionButton onClick={() => setTemporaryCredential(null)}>Done</ActionButton></div></section></div>}
  </div>;
}
