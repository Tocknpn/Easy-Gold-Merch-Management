import { useEffect, useMemo, useState } from 'react';
import {
  Users, FolderTree, ToggleRight, UserPlus, Pencil, KeyRound, Eye, EyeOff,
  Copy, Power, Trash2, Search, ShieldCheck, Loader2,
  Mail, Send, RefreshCw, AlertTriangle, ExternalLink, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { useAuth, getUserRoleLabel } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Spinner, ErrorBanner, Badge, Modal, toast } from '@/components/ui/primitives';
import { ROLE_LABELS, type AppUser, type NewUserInput, type TicketWithItems, type UserRole } from '@/lib/types';
import { cn, whenStamp } from '@/lib/utils';
import {
  emailFunctionStatus, fetchEmailLog, previewTicketEmail, sendTestEmail,
  summariseEmails, type EmailFunctionStatus, type EmailLogRow, type EmailPreview,
} from '@/lib/ticketNotify';

/** Every role the app understands, in ROLE_LABELS order (drives the dropdowns). */
const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

/** Draft used by the Add / Edit user modal. */
interface UserDraft {
  id?: string;
  fullName: string;
  username: string;
  email: string;
  department: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  password: string;
}

const EMPTY_DRAFT: UserDraft = {
  fullName: '', username: '', email: '', department: '',
  role: 'staff', status: 'Active', password: '',
};

type Tab = 'users' | 'categories' | 'config' | 'email';

export function SystemSettingsPage() {
  const { user } = useAuth();
  const { users, categories, config, tickets, loading, error, refresh } = useData();
  const [tab, setTab] = useState<Tab>('users');

  if (loading) return <Spinner label="Loading settings…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
    { key: 'categories', label: 'Categories', icon: <FolderTree className="h-4 w-4" /> },
    { key: 'config', label: 'Configuration', icon: <ToggleRight className="h-4 w-4" /> },
    { key: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">System Settings</h1>
      </div>

      <div className="flex gap-1.5 rounded-xl bg-slate-100 p-1 no-print">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition',
              tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab users={users} />}

      {tab === 'categories' && <CategoriesTab categories={categories} />}
      {tab === 'config' && <ConfigTab config={config} />}
      {tab === 'email' && <EmailTab config={config} tickets={tickets} users={users} />}
      <p className="text-[11px] text-slate-400 no-print">Signed in as {user?.fullName} · {getUserRoleLabel(user?.role || '')}</p>
    </div>
  );
}
function CategoriesTab({ categories }: { categories: string[] }) {
  const { manageCategory, refresh } = useData();
  const [name, setName] = useState('');

  const add = async () => {
    if (!name.trim()) { toast('Enter a category name', 'error'); return; }
    await manageCategory('add', name.trim());
    toast(`Category "${name.trim()}" added`);
    setName('');
    await refresh();
  };
  const del = async (cat: string) => {
    await manageCategory('delete', cat);
    toast(`Category "${cat}" deleted`, 'info');
    await refresh();
  };

  const color = (i: number) => ['bg-brand-50 text-brand-700', 'bg-cyan-50 text-cyan-700', 'bg-violet-50 text-violet-700'][i % 3];

  return (
    <div className="card card-pad">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">Categories</h2>
      {categories.length === 0 ? (
        <p className="text-sm text-slate-400">No categories yet.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {categories.map((c, i) => (
            <span key={c} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', color(i))}>
              {c}
              <button className="opacity-60 hover:opacity-100" onClick={() => del(c)} title={`Delete ${c}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input className="input max-w-xs" placeholder="New category…" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function ConfigTab({ config }: { config: Record<string, string> }) {
  const { manageConfig, refresh } = useData();
  const [threshold, setThreshold] = useState(config.bypass_threshold || '0');
  const [level, setLevel] = useState(config.bypass_level || 'none');

  const save = async () => {
    await manageConfig('bypass_threshold', threshold);
    await manageConfig('bypass_level', level);
    toast('Configuration saved');
    await refresh();
  };

  return (
    <div className="card card-pad max-w-2xl space-y-4">
      <h2 className="text-sm font-semibold text-slate-800">Approval bypass</h2>
      <div>
        <label className="label">Cost threshold (₭) — tickets below this skip approval levels</label>
        <input className="input max-w-xs" type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      </div>
      <div>
        <label className="label">Bypass level</label>
        <select className="input max-w-xs" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="none">None — full approval chain</option>
          <option value="wh_only">Warehouse only</option>
          <option value="wh_lm">Warehouse + Line Manager</option>
        </select>
      </div>
      <div>
        <button className="btn btn-primary btn-sm" onClick={save}>Save configuration</button>
      </div>
      <p className="text-[11px] text-slate-400">Applied by the SQL function update_ticket_status on the server.</p>
    </div>
  );
}
// ─ Users tab — Admin can add / edit / activate / set password / delete ──
const ICON_BTN =
  'grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400';

function UsersTab({ users }: { users: AppUser[] }) {
  const { user: me } = useAuth();
  const {
    addUser, updateUser, setUserPassword, setUserStatus, deleteUser,
    revealUserPassword,
  } = useData();
  const isAdmin = me?.role === 'admin';

  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [pwTarget, setPwTarget] = useState<AppUser | null>(null);
  const [delTarget, setDelTarget] = useState<AppUser | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...users]
      .filter((u) =>
        !q
        || (u.fullName || '').toLowerCase().includes(q)
        || (u.email || '').toLowerCase().includes(q)
        || (u.department || '').toLowerCase().includes(q)
        || getUserRoleLabel(u.role).toLowerCase().includes(q))
      .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email, 'la'));
  }, [users, search]);

  const isSelf = (u: AppUser) =>
    u.id === me?.id || (!!me?.email && (u.email || '').toLowerCase() === me.email.toLowerCase());

  const openAdd = () => setDraft({ ...EMPTY_DRAFT });
  const openEdit = (u: AppUser) => setDraft({
    id: u.id, fullName: u.fullName || '', username: u.username || '', email: u.email || '',
    department: u.department || '', role: u.role,
    status: String(u.status || 'Active').toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
    password: '',
  });

  const submitDraft = async (d: UserDraft) => {
    if (d.id) {
      await updateUser(d.id, {
        email: d.email, username: d.username, fullName: d.fullName,
        department: d.department, role: d.role, status: d.status,
      });
      toast(`User ${d.fullName || d.email} updated`);
    } else {
      const payload: NewUserInput = {
        email: d.email, fullName: d.fullName, username: d.username,
        department: d.department, role: d.role, password: d.password,
      };
      await addUser(payload);
      toast(`User ${d.email} created — share the password you typed`);
    }
    setDraft(null);
  };

  const toggleReveal = async (u: AppUser) => {
    if (u.id in revealed) {
      setRevealed((r) => {
        const next = { ...r };
        delete next[u.id];
        return next;
      });
      return;
    }
    setBusyId(u.id);
    try {
      const pw = await revealUserPassword(u.id);
      setRevealed((r) => ({ ...r, [u.id]: pw }));
      if (!pw) toast('No password stored for this user yet — use "Set password"', 'info');
    } catch (e: any) {
      toast(e?.message || 'Could not read the password', 'error');
    } finally {
      setBusyId(null);
    }
  };
const copyPassword = async (u: AppUser) => {
    setBusyId(u.id);
    try {
      const pw = u.id in revealed ? revealed[u.id] : await revealUserPassword(u.id);
      setRevealed((r) => ({ ...r, [u.id]: pw }));
      if (!pw) { toast('No password stored for this user yet', 'info'); return; }
      await navigator.clipboard.writeText(pw);
      toast('Password copied to clipboard');
    } catch (e: any) {
      toast(e?.message || 'Could not copy the password', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (u: AppUser) => {
    const next: 'Active' | 'Inactive' =
      String(u.status || 'Active').toLowerCase() === 'inactive' ? 'Active' : 'Inactive';
    setBusyId(u.id);
    try {
      await setUserStatus(u.id, next);
      toast(`${u.fullName || u.email} is now ${next}`);
    } catch (e: any) {
      toast(e?.message || 'Could not change the status', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!delTarget) return;
    setBusyId(delTarget.id);
    try {
      await deleteUser(delTarget.id);
      toast(`${delTarget.fullName || delTarget.email} deleted`, 'info');
      setDelTarget(null);
    } catch (e: any) {
      toast(e?.message || 'Could not delete the user', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const savePassword = async (password: string) => {
    if (!pwTarget) return;
    await setUserPassword(pwTarget.id, password);
    setRevealed((r) => ({ ...r, [pwTarget.id]: password }));
    toast(`Password updated for ${pwTarget.fullName || pwTarget.email}`);
    setPwTarget(null);
  };

  return (
    <div className="card card-pad">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Users ({users.length})</h2>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-slate-400">
            {isAdmin
              ? 'Add, edit, activate/deactivate, delete and set the password of any user. Sign-in passwords are stored in Supabase (public.users.password) and hashed for the actual login.'
              : 'Read-only — only an Admin can add or change users.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              className="input h-9 w-48 rounded-xl pl-8 text-[13px] sm:w-56"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <UserPlus className="h-3.5 w-3.5" /> Add user
            </button>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3.5 py-2.5 text-[11px] text-brand-800">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Only an Admin can add users, change roles, activate/deactivate accounts or reveal passwords.</span>
        </div>
      )}
<div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="table-head pb-2 pr-3">Name</th>
              <th className="table-head pb-2 pr-3">Email</th>
              <th className="table-head pb-2 pr-3">Role</th>
              <th className="table-head pb-2 pr-3">Department</th>
              <th className="table-head pb-2 pr-3">Password</th>
              <th className="table-head pb-2 pr-3">Status</th>
              {isAdmin && <th className="table-head pb-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="py-8 text-center text-sm text-slate-400">
                  {search ? `No user matches "${search}"` : 'No users yet.'}
                </td>
              </tr>
            )}
            {rows.map((u) => {
              const active = String(u.status || 'Active').toLowerCase() !== 'inactive';
              const shown = u.id in revealed;
              const self = isSelf(u);
              return (
                <tr key={u.id} className="align-middle hover:bg-slate-50/70">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-slate-800">
                      {u.fullName || '—'}
                      {self && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-brand-600">you</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">{u.username || '—'}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-500">{u.email}</td>
                  <td className="py-2.5 pr-3">
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{getUserRoleLabel(u.role)}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">{u.department || '—'}</td>
                  <td className="py-2.5 pr-3">
                    {isAdmin ? (
                      <div className="flex items-center gap-1">
                        <span className={cn('font-mono text-xs', shown ? 'text-slate-800' : 'text-slate-400')}>
                          {shown ? (revealed[u.id] || '— not set —') : '••••••••'}
                        </span>
                        <button
                          type="button"
                          className={ICON_BTN}
                          title={shown ? 'Hide password' : 'Show password'}
                          onClick={() => toggleReveal(u)}
                          disabled={busyId === u.id}
                        >
                          {busyId === u.id && !shown
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          className={ICON_BTN}
                          title="Copy password"
                          onClick={() => copyPassword(u)}
                          disabled={busyId === u.id}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">Hidden</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge className={active
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                      : 'bg-rose-50 text-rose-700 ring-rose-600/20'}>
                      {active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <button type="button" className={ICON_BTN} title="Edit user details" onClick={() => openEdit(u)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className={ICON_BTN} title="Set a new password" onClick={() => setPwTarget(u)}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={cn(ICON_BTN, active ? 'hover:text-amber-600' : 'hover:text-emerald-600')}
                          title={active ? 'Deactivate account' : 'Activate account'}
                          onClick={() => toggleStatus(u)}
                          disabled={busyId === u.id || self}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={cn(ICON_BTN, 'hover:text-rose-600')}
                          title="Delete user"
                          onClick={() => setDelTarget(u)}
                          disabled={busyId === u.id || self}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
<p className="mt-3 text-[11px] text-slate-400">
        Deactivating a user blocks their sign-in immediately. Setting a password signs them out of every device so they must use the new one.
      </p>

      {draft && (
        <UserFormModal draft={draft} onClose={() => setDraft(null)} onSubmit={submitDraft} />
      )}
      {pwTarget && (
        <PasswordModal user={pwTarget} onClose={() => setPwTarget(null)} onSubmit={savePassword} />
      )}
      {delTarget && (
        <Modal open onClose={() => setDelTarget(null)} title="Delete user">
          <p className="text-sm text-slate-600">
            Delete <b>{delTarget.fullName || delTarget.email}</b>? Their sign-in account and profile are
            removed — past tickets stay in the history under their name.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setDelTarget(null)}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={confirmDelete} disabled={busyId === delTarget.id}>
              {busyId === delTarget.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete user
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
// ─ Add / Edit user modal ────────────────────────────────────────────────
function UserFormModal({
  draft, onClose, onSubmit,
}: {
  draft: UserDraft;
  onClose: () => void;
  onSubmit: (d: UserDraft) => Promise<void>;
}) {
  const isEdit = !!draft.id;
  const [form, setForm] = useState<UserDraft>(draft);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<UserDraft>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const email = form.email.trim().toLowerCase();
    if (!form.fullName.trim()) { toast('Full name is required', 'error'); return; }
    if (!email || !email.includes('@')) { toast('A valid email address is required', 'error'); return; }
    if (!isEdit && form.password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    setBusy(true);
    try {
      await onSubmit({ ...form, email });
    } catch (e: any) {
      toast(e?.message || 'Could not save the user', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit user — ${form.fullName || form.email}` : 'Add user'}>
      <div className="space-y-3.5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label className="label">Full name *</label>
            <input
              className="input"
              value={form.fullName}
              onChange={(e) => set({ fullName: e.target.value })}
              placeholder="e.g. Souk Phommachanh"
            />
          </div>
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => set({ username: e.target.value })}
              placeholder="Defaults to the email"
            />
          </div>
        </div>

        <div>
          <label className="label">Email (sign-in) *</label>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="name@easygold.com"
          />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label className="label">Department</label>
            <input
              className="input"
              value={form.department}
              onChange={(e) => set({ department: e.target.value })}
              placeholder="MKT / BTL / CS"
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => set({ role: e.target.value as UserRole })}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
        </div>

        {isEdit ? (
          <div>
            <label className="label">Account status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => set({ status: e.target.value as 'Active' | 'Inactive' })}
            >
              <option value="Active">Active — can sign in</option>
              <option value="Inactive">Inactive — sign-in blocked</option>
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Password * (min 6 characters)</label>
            <div className="flex gap-2">
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                placeholder="Password for the new user"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm shrink-0"
                onClick={() => setShowPw((s) => !s)}
                title={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Saved with the user and used for their first sign-in — share it with them.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          {isEdit ? 'Save changes' : 'Create user'}
        </button>
      </div>
    </Modal>
  );
}
// ─ Set / change password modal ─────────────────────────────────────────
function PasswordModal({
  user, onClose, onSubmit,
}: {
  user: AppUser;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pw.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    if (pw !== confirm) { toast('The two passwords do not match', 'error'); return; }
    setBusy(true);
    try {
      await onSubmit(pw);
    } catch (e: any) {
      toast(e?.message || 'Could not set the password', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Password — ${user.fullName || user.email}`}>
      <div className="space-y-3.5">
        <div>
          <label className="label">New password *</label>
          <div className="flex gap-2">
            <input
              className="input"
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 6 characters"
              autoFocus
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm shrink-0"
              onClick={() => setShow((s) => !s)}
              title={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label">Repeat new password *</label>
          <input
            className="input"
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          />
        </div>

        <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-500 ring-1 ring-slate-100">
          The password is stored on the user record (public.users.password) so an Admin can look it up
          later, and hashed for the real sign-in. <b>{user.fullName || user.email}</b> is signed out of
          every device and must sign in again with the new password.
        </p>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Set password
        </button>
      </div>
    </Modal>
  );
}

// ─ Email tab — notification settings, template preview and delivery log ──
// The who/when/what is decided server-side (supabase/functions/send-ticket-email
// + the trigger in migration 0020); this tab configures it, proves it works and
// shows what actually went out.
function EmailTab({ config, tickets, users }: {
  config: Record<string, string>;
  tickets: TicketWithItems[];
  users: AppUser[];
}) {
  const { manageConfig, refresh } = useData();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [enabled, setEnabled] = useState(String(config.email_enabled ?? 'true') !== 'false');
  const [fromName, setFromName] = useState(config.email_from_name || 'Easy Gold Merch System');
  const [appUrl, setAppUrl] = useState(config.email_app_url || 'https://easy-gold-merch-management.tockppd.workers.dev');
  const [notifyUrl, setNotifyUrl] = useState(config.email_notify_url || '');
  const [dirty, setDirty] = useState(false);

  const [fn, setFn] = useState<EmailFunctionStatus | null>(null);
  const [log, setLog] = useState<EmailLogRow[]>([]);
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'preview' | 'reload'>('');
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [pickedId, setPickedId] = useState('');

  // Newest first, and never more than we are willing to render in a dropdown.
  const previewables = useMemo(
    () => [...tickets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 60),
    [tickets],
  );
  const picked = previewables.find((t) => t.id === pickedId) || previewables[0] || null;

  const reload = async (silent = false) => {
    if (!silent) setBusy('reload');
    try {
      const [status, rows] = await Promise.all([
        emailFunctionStatus(),
        // email_log is admin-only by row level security, so nobody else asks.
        isAdmin ? fetchEmailLog(25).catch(() => [] as EmailLogRow[]) : Promise.resolve([] as EmailLogRow[]),
      ]);
      setFn(status);
      setLog(rows);
    } finally {
      if (!silent) setBusy('');
    }
  };

  useEffect(() => { void reload(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async () => {
    setBusy('save');
    try {
      await manageConfig('email_enabled', enabled ? 'true' : 'false');
      await manageConfig('email_from_name', fromName.trim() || 'Easy Gold Merch System');
      await manageConfig('email_app_url', appUrl.trim().replace(/\/+$/, ''));
      await manageConfig('email_notify_url', notifyUrl.trim());
      toast('Email settings saved');
      setDirty(false);
      await refresh();
      await reload(true);
    } catch (e: any) {
      toast(e?.message || 'Could not save the email settings', 'error');
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const res = await sendTestEmail();
      if (res.ok && !res.error) {
        toast(`Test email sent to you${res.quotaLeft !== undefined ? ` · ${res.quotaLeft} recipients left today` : ''}`);
      } else {
        toast(res.error || 'The test email could not be sent', 'error');
      }
      await reload(true);
    } finally {
      setBusy('');
    }
  };

  const showPreview = async () => {
    if (!picked) { toast('There is no ticket to preview yet', 'error'); return; }
    setBusy('preview');
    try {
      setPreview(await previewTicketEmail(picked.id, { ticket: picked, users, appUrl }));
    } catch (e: any) {
      toast(e?.message || 'Could not render the preview', 'error');
    } finally {
      setBusy('');
    }
  };

  const newestQuota = log.find((r) => r.quotaLeft !== null)?.quotaLeft ?? null;
  const failures = log.filter((r) => r.ok === false);

  return (
    <div className="space-y-4">
      <StatusCard fn={fn} enabled={enabled} quota={newestQuota} busy={busy === 'reload'} onReload={() => void reload()} />

      {failures.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>{failures.length}</b> recent {failures.length === 1 ? 'attempt' : 'attempts'} failed —
            the newest reason: “{failures[0].error}”. A failure never blocks a ticket; the ticket still moves.
          </span>
        </div>
      )}

      <div className="card card-pad max-w-3xl space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Notification settings</h2>

        <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-100">
          <span className="text-sm text-slate-700">
            Send ticket emails
            <span className="block text-[11px] text-slate-400">
              Warehouse on a new request → Line Manager on review → Director on approval → requester on the result.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-brand-600"
            checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); setDirty(true); }}
          />
        </label>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label className="label">Sender name</label>
            <input className="input" value={fromName}
              onChange={(e) => { setFromName(e.target.value); setDirty(true); }} />
          </div>
          <div>
            <label className="label">App URL (the button in the email)</label>
            <input className="input" value={appUrl} placeholder="https://easy-gold-merch-management.tockppd.workers.dev"
              onChange={(e) => { setAppUrl(e.target.value); setDirty(true); }} />
          </div>
        </div>

        <div>
          <label className="label">Notify function URL</label>
          <input className="input font-mono text-[12px]" value={notifyUrl}
            onChange={(e) => { setNotifyUrl(e.target.value); setDirty(true); }} />
          <p className="mt-1 text-[11px] text-slate-400">
            Supabase → Functions → <code>send-ticket-email</code>. The database trigger calls this
            URL on every status change; the secret it sends is stored in Supabase Vault
            (<code>email_webhook_secret</code>), never here.
          </p>
        </div>

        {dirty && <p className="text-[11px] font-semibold text-amber-700">Unsaved changes</p>}

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy !== ''}>
            {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ToggleRight className="h-3.5 w-3.5" />}
            Save settings
          </button>
          <button className="btn btn-secondary btn-sm" onClick={test} disabled={busy !== '' || !fn?.deployed}
            title={fn?.deployed ? 'Send the current template to your own inbox' : 'Deploy the function first'}>
            {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send test email
          </button>
        </div>
      </div>

      <div className="card max-w-3xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Email preview</h2>
            <p className="text-[11px] text-slate-400">Exactly what the recipient sees — rendered from a real ticket.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input h-9 w-full max-w-[220px] text-[12px]"
              value={picked?.id || ''}
              onChange={(e) => setPickedId(e.target.value)}
            >
              {previewables.length === 0 && <option value="">No tickets yet</option>}
              {previewables.map((t) => (
                <option key={t.id} value={t.id}>{t.id} · {t.status}</option>
              ))}
            </select>
            <button className="btn btn-secondary btn-sm" onClick={showPreview} disabled={busy !== '' || !picked}>
              {busy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Open preview
            </button>
          </div>
        </div>
        <p className="px-4 py-3 text-[11px] text-slate-400">
          The preview is rendered by the same code that sends the real mail, so what you open here is
          character-for-character what Gmail will show.
        </p>
      </div>

      <div className="card max-w-3xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Delivery log</h2>
            <p className="text-[11px] text-slate-400">
              {isAdmin
                ? 'The last 25 notification attempts (the old “Email_Debug” sheet, now queryable).'
                : 'Only an Admin can read the delivery log.'}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => void reload()} disabled={busy !== ''}>
            {busy === 'reload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
        {log.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-slate-400">
            Nothing logged yet. Create a ticket (or press “Send test email”) and the attempts appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="table-head px-4 py-2">When</th>
                  <th className="table-head px-4 py-2">Ticket</th>
                  <th className="table-head px-4 py-2">Subject</th>
                  <th className="table-head px-4 py-2">To</th>
                  <th className="table-head px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {log.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">{whenStamp(r.at) || r.at}</td>
                    <td className="px-4 py-2 font-medium text-slate-700">{r.ticketId || '—'}</td>
                    <td className="max-w-[260px] truncate px-4 py-2 text-slate-600" title={r.subject}>{r.subject || '—'}</td>
                    <td className="px-4 py-2 text-slate-500" title={[...r.to, ...r.cc].join(', ')}>
                      {summariseEmails(r.to)}
                      {r.cc.length > 0 && <span className="text-slate-400"> · cc {summariseEmails(r.cc)}</span>}
                    </td>
                    <td className="px-4 py-2">
                      {r.ok === true && (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                          {r.quotaLeft !== null && <span className="font-normal text-slate-400">· {r.quotaLeft} left</span>}
                        </span>
                      )}
                      {r.ok === null && (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Clock className="h-3.5 w-3.5" /> Queued
                        </span>
                      )}
                      {r.ok === false && (
                        <span className="inline-flex items-start gap-1 text-rose-700" title={r.error || ''}>
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="max-w-[220px]">{r.error || 'Failed'}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {preview && (
        <Modal open onClose={() => setPreview(null)} title={`Email preview — ${picked?.id || ''}`} wide>
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12px] ring-1 ring-slate-100">
              <p className="text-slate-500">Subject</p>
              <p className="font-semibold text-slate-800">{preview.subject}</p>
              <p className="mt-2 text-slate-500">To</p>
              <p className="text-slate-800">{preview.to.join(', ') || '—'}</p>
              {preview.cc.length > 0 && (<>
                <p className="mt-2 text-slate-500">Cc</p>
                <p className="text-slate-800">{preview.cc.join(', ')}</p>
              </>)}
            </div>
            <iframe
              title="Ticket notification email"
              srcDoc={preview.html}
              className="h-[540px] w-full rounded-xl border border-slate-200 bg-white"
              sandbox=""
            />
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Health card: is the chain wired end-to-end, and how much Gmail quota is left? */
function StatusCard({ fn, enabled, quota, busy, onReload }: {
  fn: EmailFunctionStatus | null;
  enabled: boolean;
  quota: number | null;
  busy: boolean;
  onReload: () => void;
}) {
  const rows: { label: string; ok: boolean | null; note?: string }[] = [
    { label: 'Notifications enabled', ok: enabled, note: enabled ? undefined : 'switched off above' },
    { label: 'Edge Function deployed', ok: fn?.deployed ?? null, note: fn?.deployed ? fn.provider : fn?.error },
    { label: 'Relay URL configured', ok: fn ? !!fn.relayUrl : null },
    { label: 'Relay secret configured', ok: fn ? !!fn.relaySecret : null },
    { label: 'Trigger secret configured', ok: fn ? !!fn.webhookSecret : null },
    { label: 'Sending as', ok: fn?.fromEmail ? true : null, note: fn?.fromEmail || 'set on the relay (Google account)' },
  ];

  return (
    <div className="card card-pad max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <Mail className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Email notifications</h2>
            <p className="text-[11px] text-slate-400">
              Sent from the company Gmail through the Google Apps Script relay.
            </p>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onReload} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-check
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 rounded-lg bg-slate-50/70 px-3 py-2 text-[12px] ring-1 ring-slate-100">
            {r.ok === true && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
            {r.ok === false && <XCircle className="h-4 w-4 shrink-0 text-rose-600" />}
            {r.ok === null && <Clock className="h-4 w-4 shrink-0 text-slate-400" />}
            <span className="text-slate-700">{r.label}</span>
            {r.note && <span className="ml-auto truncate text-[11px] text-slate-400" title={r.note}>{r.note}</span>}
          </div>
        ))}
      </div>

      {quota !== null && quota <= 25 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The sending Gmail account has <b>{quota}</b> recipients left today. A free @gmail.com
            account allows 100 recipients per day (counted per address in To + Cc).
          </span>
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Not receiving mail? Deploy the function (<code>npm run functions:deploy</code>), paste the relay
        (<code>apps-script/EmailRelay.gs</code>) into the sending Gmail account and set its
        <code> RELAY_SECRET</code>, then store the same value in Supabase Vault as
        <code> email_webhook_secret</code>. Full checklist: <b>DEPLOY.md → Email notifications</b>.
      </p>
    </div>
  );
}


