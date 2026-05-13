import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

export function SessionsPage() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall('/api/admin/sessions');
      setAdmins(res.admins || []);
      setError('');
    } catch (e) {
      setAdmins([]);
      setError(e?.message || 'Could not load admin users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="adm-page-head">
        <h1>Admin users</h1>
        <p>
          Accounts that can sign into this panel (from <code>admin_users</code>). Live session tracking is not
          yet implemented — when it is, the timestamps below become "last active" and we will surface IP/device
          here. Until then, this page shows real account data only.
        </p>
      </header>

      <div className="adm-toolbar">
        <button type="button" className="adm-btn adm-btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span className="adm-mono" style={{ color: 'var(--muted)' }}>
          {admins.length} admin{admins.length === 1 ? '' : 's'}
        </span>
      </div>

      {error ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Error:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{error}</span>
        </div>
      ) : null}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Full name</th>
              <th>Status</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td><strong style={{ color: '#fff' }}>{a.email}</strong></td>
                <td>{a.fullName || '—'}</td>
                <td>
                  <span className={`adm-badge ${a.isActive ? 'active' : 'paused'}`}>
                    {a.isActive ? 'active' : 'disabled'}
                  </span>
                </td>
                <td className="adm-mono">{formatDate(a.createdAt)}</td>
                <td className="adm-mono">{formatDate(a.updatedAt)}</td>
              </tr>
            ))}
            {!admins.length && !loading ? (
              <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No admin users found.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
