import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES');
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
      setError(e?.message || 'No se pudieron cargar los administradores');
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
        <h1>Administradores</h1>
        <p>
          Cuentas con acceso a este panel (desde <code>admin_users</code>). El seguimiento de sesiones en vivo
          aún no está implementado — cuando lo esté, las marcas de tiempo de abajo pasarán a ser "última
          actividad" y mostraremos IP/dispositivo aquí. Hasta entonces, esta página solo muestra datos reales
          de cuenta.
        </p>
      </header>

      <div className="adm-toolbar">
        <button type="button" className="adm-btn adm-btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
        <span className="adm-mono" style={{ color: 'var(--muted)' }}>
          {admins.length} administrador{admins.length === 1 ? '' : 'es'}
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
              <th>Correo</th>
              <th>Nombre completo</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td><strong style={{ color: '#fff' }}>{a.email}</strong></td>
                <td>{a.fullName || '—'}</td>
                <td>
                  <span className={`adm-badge ${a.isActive ? 'active' : 'paused'}`}>
                    {a.isActive ? 'activo' : 'deshabilitado'}
                  </span>
                </td>
                <td className="adm-mono">{formatDate(a.createdAt)}</td>
                <td className="adm-mono">{formatDate(a.updatedAt)}</td>
              </tr>
            ))}
            {!admins.length && !loading ? (
              <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No se encontraron administradores.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
