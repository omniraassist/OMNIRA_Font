import { useEffect, useRef, useState } from 'react';
import { apiCall } from '../api/client.js';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

/**
 * Client-side image resize: draws the user's file onto a 256×256 canvas
 * (cover-cropped) and exports JPEG at 0.82 quality. This keeps the encoded
 * payload around 30–80 KB so the server-side 256 KB cap is comfortable.
 */
async function fileToAvatarDataUrl(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPEG, WEBP, or GIF).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image is too large (max 8 MB before resize).');
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('Could not decode the image.');
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported in this browser.');
  // Cover-fit: scale to fill, then center-crop.
  const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
  const sw = SIZE / scale;
  const sh = SIZE / scale;
  const sx = (bitmap.width - sw) / 2;
  const sy = (bitmap.height - sh) / 2;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

const STYLES = `
  .p-grid { display: grid; grid-template-columns: minmax(280px, 340px) 1fr; gap: 18px; align-items: start; }
  @media (max-width: 880px) { .p-grid { grid-template-columns: 1fr; } }

  .p-id, .p-card { animation: p-rise .4s ease-out both; }
  .p-id { animation-delay: .02s; }
  .p-card:nth-of-type(1) { animation-delay: .08s; }
  .p-card:nth-of-type(2) { animation-delay: .14s; }
  .p-card:nth-of-type(3) { animation-delay: .20s; }
  .p-card:nth-of-type(4) { animation-delay: .26s; }
  @keyframes p-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .p-id {
    background:
      radial-gradient(80% 60% at 50% 0%, rgba(0,229,160,0.12), transparent 65%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 26px 22px;
    text-align: center;
    position: relative; overflow: hidden;
    position: sticky;
    top: 16px;
  }
  @media (max-width: 880px) { .p-id { position: static; } }
  .p-id::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(60% 50% at 50% 0%, rgba(0,229,160,0.12), transparent 70%);
    pointer-events: none;
  }
  .p-av {
    width: 96px; height: 96px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 36px;
    color: #00120a;
    box-shadow: 0 10px 30px rgba(0,229,160,0.25);
    margin-bottom: 14px;
    overflow: hidden;
  }
  .p-av img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .p-av-edit {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 18px;
    margin-bottom: 4px;
    padding: 14px;
    border: 1px dashed rgba(255,255,255,0.08);
    border-radius: 14px;
    background: rgba(255,255,255,0.02);
    transition: border-color .2s ease, background .2s ease;
  }
  .p-av-edit.drag { border-color: var(--em); background: rgba(0,229,160,0.05); }
  @media (max-width: 480px) { .p-av-edit { grid-template-columns: 1fr; justify-items: center; text-align: center; } }
  .p-av-edit .preview {
    width: 96px; height: 96px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 32px;
    color: #00120a;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
    border: 3px solid var(--border-em);
    box-shadow: 0 12px 32px rgba(0,229,160,0.25);
  }
  .p-av-edit .preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .p-av-edit .preview.busy::after {
    content: ''; position: absolute; inset: 0;
    background: rgba(0,0,0,0.55) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='%2300e5a0' stroke-width='2'><circle cx='12' cy='12' r='10' stroke-opacity='0.25'/><path d='M22 12a10 10 0 0 0-10-10' stroke-linecap='round'/></svg>") center/30px no-repeat;
    animation: spin 0.8s linear infinite;
    border-radius: 999px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .p-av-edit .info { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .p-av-edit .info p { margin: 0; font-size: 12px; color: var(--soft); line-height: 1.5; }
  .p-av-edit .info .controls { display: flex; gap: 8px; flex-wrap: wrap; }
  .p-av-edit input[type=file] { display: none; }
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
  const fileRef = useRef(null);
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
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
        setAvatar(res.admin?.avatar_data_url || '');
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

  const onPickAvatar = () => fileRef.current?.click();

  const handleAvatarFile = async (file) => {
    if (!file) return;
    setError(''); setInfo('');
    setSavingAvatar(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      const res = await apiCall(`/api/admin/admins/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ avatar_data_url: dataUrl }),
      });
      setAdmin(res.admin);
      setAvatar(res.admin?.avatar_data_url || '');
      updateUser({ avatar: res.admin?.avatar_data_url || null });
      setInfo('Profile photo updated.');
    } catch (ex) {
      setError(ex?.message || 'Could not update photo');
    } finally {
      setSavingAvatar(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onFileChosen = (e) => handleAvatarFile(e.target.files?.[0]);

  const onDragOver = (e) => { e.preventDefault(); if (!dragOver) setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleAvatarFile(file);
  };

  const removeAvatar = async () => {
    if (!avatar) return;
    if (!window.confirm('Remove your profile photo?')) return;
    setError(''); setInfo('');
    setSavingAvatar(true);
    try {
      const res = await apiCall(`/api/admin/admins/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ avatar_data_url: '' }),
      });
      setAdmin(res.admin);
      setAvatar('');
      updateUser({ avatar: null });
      setInfo('Profile photo removed.');
    } catch (ex) {
      setError(ex?.message || 'Could not remove photo');
    } finally {
      setSavingAvatar(false);
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
          <div className="p-av">
            {avatar ? <img src={avatar} alt={admin?.full_name || 'admin avatar'} /> : initials}
          </div>
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
            <h3>Profile photo</h3>
            <p className="sub">
              Auto-resized to 256×256 JPEG. Recommended: a square image of your face or logo, &lt; 8 MB.
              Shown in the top bar, the sidebar footer, and everywhere your initials currently appear.
            </p>
            <div
              className={`p-av-edit${dragOver ? ' drag' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <div className={`preview${savingAvatar ? ' busy' : ''}`}>
                {avatar ? <img src={avatar} alt="Current profile" /> : initials}
              </div>
              <div className="info">
                <p>
                  {dragOver
                    ? 'Drop the image here to upload'
                    : 'Drag & drop, or click Upload. PNG / JPEG / WEBP / GIF — resized to 256×256 JPEG in your browser before uploading.'}
                </p>
                <div className="controls">
                  <button type="button" className="p-btn" onClick={onPickAvatar} disabled={savingAvatar}>
                    {savingAvatar ? 'Uploading…' : avatar ? 'Replace photo' : 'Upload photo'}
                  </button>
                  {avatar ? (
                    <button type="button" className="p-btn danger" onClick={removeAvatar} disabled={savingAvatar}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={onFileChosen}
                />
              </div>
            </div>
          </section>

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
