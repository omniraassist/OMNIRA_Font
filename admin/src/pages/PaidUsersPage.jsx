import { useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';

export function PaidUsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await apiCall(
        `/api/admin/users?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`
      );
      setUsers(res.users || []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    apiCall(`/api/admin/users?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`)
      .then((res) => {
        if (!mounted) return;
        setUsers(res.users || []);
      })
      .catch(() => {
        if (!mounted) return;
        setUsers([]);
      });
    return () => {
      mounted = false;
    };
  }, [search, status]);

  const openEdit = (u) => {
    setEditing(u.id);
    setForm({
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      email: u.email || '',
      phone: u.phone || '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    await apiCall(`/api/admin/users/${editing}`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });
    setEditing(null);
    await loadUsers();
  };

  const toggleBlock = async (u) => {
    await apiCall(`/api/admin/users/${u.id}/block`, {
      method: 'PATCH',
      body: JSON.stringify({ blocked: u.is_active }),
    });
    await loadUsers();
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Delete ${u.email}?`)) return;
    await apiCall(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    await loadUsers();
  };

  return (
    <>
      <header className="adm-page-head">
        <h1>All users</h1>
        <p>
          Manage all customer users. You can search, filter, edit profile fields, block login, or delete user records.
        </p>
      </header>

      <div className="adm-toolbar">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="adm-search-input"
            style={{ minWidth: 240 }}
            placeholder="Search email / name / phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="adm-btn adm-btn-ghost" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <span className="adm-mono" style={{ color: 'var(--muted)' }}>
          {loading ? 'Loading...' : `${users.length} records`}
        </span>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Plan</th>
              <th>Subscription</th>
              <th>Account</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : '—'}
                </td>
                <td className="adm-mono">{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td>{u.plan || '—'}</td>
                <td>
                  {u.subscription_active ? (
                    <span className="adm-badge active">
                      active{u.subscription_ends_at ? ` · ${u.subscription_ends_at.slice(0, 10)}` : ''}
                    </span>
                  ) : (
                    <span className="adm-badge paused">none</span>
                  )}
                </td>
                <td>
                  <span className={`adm-badge ${u.is_active ? 'active' : 'paused'}`}>
                    {u.is_active ? 'enabled' : 'blocked'}
                  </span>
                </td>
                <td className="adm-mono">{new Date(u.created_at).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="adm-btn adm-btn-ghost" onClick={() => openEdit(u)}>Edit</button>
                  <button type="button" className="adm-btn adm-btn-ghost" onClick={() => toggleBlock(u)}>
                    {u.is_active ? 'Block' : 'Unblock'}
                  </button>
                  <button type="button" className="adm-btn adm-btn-ghost" onClick={() => removeUser(u)}>Delete</button>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={8} style={{ color: 'var(--muted)' }}>No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <section className="adm-card" style={{ marginTop: 16 }}>
          <h2 className="adm-card-title">Edit user</h2>
          <div className="adm-form-grid">
            <div className="adm-field">
              <label>First name</label>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="adm-field">
              <label>Last name</label>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div className="adm-field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="adm-field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" className="adm-btn adm-btn-primary" onClick={saveEdit}>Save</button>
            <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </section>
      )}
    </>
  );
}
