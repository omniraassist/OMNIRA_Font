import { useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const STYLES = `
  .p-grid { display: grid; grid-template-columns: minmax(280px, 320px) 1fr; gap: 18px; }
  @media (max-width: 880px) { .p-grid { grid-template-columns: 1fr; } }

  .p-id {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-md);
    padding: 22px;
    text-align: center;
    position: relative; overflow: hidden;
  }
  .p-id::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(60% 50% at 50% 0%, rgba(0,229,160,0.12), transparent 70%);
    pointer-events: none;
  }
  .p-av {
    width: 84px; height: 84px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 32px;
    color: #00120a;
    box-shadow: 0 10px 30px rgba(0,229,160,0.25);
    margin-bottom: 14px;
  }
  .p-id h3 { margin: 0 0 4px; font-family: var(--font-display); font-size: 18px; color: var(--text); }
  .p-id .em { color: var(--soft); font-size: 13px; }
  .p-badge {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 12px;
    padding: 4px 10px;
    background: rgba(0,229,160,0.10);
    border: 1px solid var(--border-em);
    border-radius: 999px;
    color: var(--em);
    font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  }
  .p-meta { margin-top: 18px; display: flex; flex-direction: column; gap: 6px; text-align: left; font-size: 12px; color: var(--muted); }
  .p-meta div { display: flex; justify-content: space-between; }
  .p-meta div span { color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 11px; }

  .p-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 22px;
  }
  .p-card h3 { margin: 0 0 4px; font-family: var(--font-display); font-size: 15px; color: var(--text); letter-spacing: .04em; text-transform: uppercase; }
  .p-card p.sub { margin: 0 0 18px; color: var(--soft); font-size: 13px; line-height: 1.5; }

  .p-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .p-row label { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .p-row input {
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 11px 12px;
    color: var(--text);
    font-size: 14px;
    transition: border-color .15s ease, background .15s ease;
  }
  .p-row input:focus { outline: none; border-color: var(--em); background: rgba(0,0,0,0.45); }
  .p-row input:read-only { color: var(--soft); background: rgba(255,255,255,0.02); }
  .p-row .hint { font-size: 11px; color: var(--muted); margin-top: 2px; }

  .p-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
  .p-btn {
    background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%);
    color: #00120a; font-weight: 700;
    border: 0; border-radius: 10px;
    padding: 11px 22px;
    cursor: pointer; transition: filter .15s ease, transform .15s ease;
  }
  .p-btn:disabled { filter: grayscale(.6) brightness(.7); cursor: not-allowed; }
  .p-btn:not(:disabled):hover { filter: brightness(1.08); }
  .p-btn.ghost {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
  }
  .p-btn.ghost:hover { border-color: var(--border-em); color: var(--em); }
  .p-btn.danger {
    background: transparent;
    color: #fca5a5;
    border: 1px solid rgba(239,68,68,0.30);
  }
  .p-btn.danger:hover { background: rgba(239,68,68,0.08); }

  .p-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 14px; }
  .p-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .p-banner.ok  { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }
`;

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return '—'; }
}

export function ProfilePage() {
  const { user, updateUser, logout } = useAdminAuth();
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [name, setName] = useState('');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');

  useEffect(() => {
    let alive = true;
    if (!user?.id) {
      setLoading(false);
      return;
    }
    apiCall(`/api/admin/admins/${user.id}`)
      .then((res) => {
        if (!alive) return;
        setAdmin(res.admin);
        setName(res.admin?.full_name || '');
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message || 'Could not load admin profile');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [user?.id]);

  const initials = (name || user?.name || 'Omnira Admin')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const saveName = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!user?.id) return;
    setSavingName(true);
    try {
      const res = await apiCall(`/api/admin/admins/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ full_name: name.trim() }),
      });
      setAdmin(res.admin);
      updateUser({ name: res.admin.full_name || 'Omnira Admin' });
      setInfo('Profile updated.');
    } catch (ex) {
      setError(ex?.message || 'Could not save name');
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!user?.id) return;
    if (newPw.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (newPw !== newPw2) { setError('New password and confirmation do not match.'); return; }
    setSavingPw(true);
    try {
      await apiCall(`/api/admin/admins/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ current_password: curPw, new_password: newPw }),
      });
      setCurPw(''); setNewPw(''); setNewPw2('');
      setInfo('Password changed. The new password is active immediately.');
    } catch (ex) {
      setError(ex?.message || 'Could not change password');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>My profile</h1>
        <p>
          Edit the name displayed in the top bar and change your sign-in password. Your email is the unique
          account identifier and cannot be changed from this panel.
        </p>
      </header>

      {error ? <div className="p-banner err"><strong>Error:</strong> {error}</div> : null}
      {info ? <div className="p-banner ok"><strong>OK:</strong> {info}</div> : null}

      <div className="p-grid">
        <aside className="p-id">
          <div className="p-av">{initials}</div>
          <h3>{admin?.full_name || name || 'Omnira Admin'}</h3>
          <div className="em">{admin?.email || user?.email || ''}</div>
          <div className="p-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Superadmin
          </div>
          <div className="p-meta">
            <div><span style={{ color: 'var(--muted)' }}>Status</span><span>{admin?.is_active === false ? 'disabled' : 'active'}</span></div>
            <div><span style={{ color: 'var(--muted)' }}>Created</span><span>{formatDate(admin?.created_at)}</span></div>
            <div><span style={{ color: 'var(--muted)' }}>Last updated</span><span>{formatDate(admin?.updated_at)}</span></div>
          </div>
        </aside>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="p-card">
            <h3>Display name</h3>
            <p className="sub">Shown in the top bar dropdown and in audit fields on notifications you send.</p>
            <form onSubmit={saveName}>
              <div className="p-row">
                <label>Email</label>
                <input value={admin?.email || user?.email || ''} readOnly />
                <span className="hint">Email is your sign-in identifier. To change it, contact a Superadmin.</span>
              </div>
              <div className="p-row">
                <label>Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={200}
                />
              </div>
              <div className="p-actions">
                <button type="submit" className="p-btn" disabled={savingName || loading || !name.trim()}>
                  {savingName ? 'Saving…' : 'Save name'}
                </button>
              </div>
            </form>
          </section>

          <section className="p-card">
            <h3>Change password</h3>
            <p className="sub">
              Passwords are hashed with PBKDF2-SHA512 (120k iterations). Choose at least 8 characters; mix of
              letters, numbers and a symbol is recommended.
            </p>
            <form onSubmit={changePassword} autoComplete="off">
              <div className="p-row">
                <label>Current password</label>
                <input
                  type="password"
                  value={curPw}
                  onChange={(e) => setCurPw(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="p-row">
                <label>New password</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="p-row">
                <label>Confirm new password</label>
                <input
                  type="password"
                  value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)}
                  placeholder="Re-enter new password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="p-actions">
                <button type="submit" className="p-btn" disabled={savingPw || !curPw || newPw.length < 8 || newPw !== newPw2}>
                  {savingPw ? 'Updating…' : 'Update password'}
                </button>
                <button type="button" className="p-btn ghost" onClick={() => { setCurPw(''); setNewPw(''); setNewPw2(''); }}>
                  Clear
                </button>
              </div>
            </form>
          </section>

          <section className="p-card">
            <h3>Session</h3>
            <p className="sub">
              Sign out of this admin panel. Your sign-in is local to this browser tab — clearing the session
              does not affect other devices (live session tracking is not yet implemented).
            </p>
            <div className="p-actions">
              <button type="button" className="p-btn danger" onClick={logout}>
                Sign out
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
