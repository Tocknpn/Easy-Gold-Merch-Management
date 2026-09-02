import { useState } from 'react';
import { Users, FolderTree, ToggleRight } from 'lucide-react';
import { useAuth, getUserRoleLabel } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Spinner, ErrorBanner, Badge, toast } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Tab = 'users' | 'categories' | 'config';

export function SystemSettingsPage() {
  const { user } = useAuth();
  const { users, categories, config, loading, error, refresh } = useData();
  const [tab, setTab] = useState<Tab>('users');

  if (loading) return <Spinner label="Loading settings…" />;
  if (error) return <ErrorBanner msg={error} retry={refresh} />;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
    { key: 'categories', label: 'Categories', icon: <FolderTree className="h-4 w-4" /> },
    { key: 'config', label: 'Configuration', icon: <ToggleRight className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">System Settings</h1>
        <p className="text-sm text-slate-500">Manage users, categories and approval configuration</p>
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

      {tab === 'users' && (
        <div className="card card-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Users ({users.length})</h2>
            <span className="text-xs text-slate-400">Add/edit users in Supabase Dashboard → Authentication.</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="table-head pb-2 pr-2">Name</th>
                  <th className="table-head pb-2 pr-2">Email</th>
                  <th className="table-head pb-2 pr-2">Role</th>
                  <th className="table-head pb-2 pr-2">Department</th>
                  <th className="table-head pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 pr-2 font-medium text-slate-800">{u.fullName}</td>
                    <td className="py-2.5 pr-2 text-slate-500">{u.email}</td>
                    <td className="py-2.5 pr-2"><Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{getUserRoleLabel(u.role)}</Badge></td>
                    <td className="py-2.5 pr-2 text-slate-600">{u.department}</td>
                    <td className="py-2.5">
                      <Badge className={u.status === 'Active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-rose-50 text-rose-700 ring-rose-600/20'}>
                        {u.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'categories' && <CategoriesTab categories={categories} />}
      {tab === 'config' && <ConfigTab config={config} />}
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