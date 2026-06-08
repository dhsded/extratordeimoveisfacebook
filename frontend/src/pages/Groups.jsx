import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useWS } from '../context/WSContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Toast System ──────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (msg, type = 'info') => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };
  return { toasts, success: (m) => add(m, 'success'), error: (m) => add(m, 'error'), info: (m) => add(m, 'info') };
}

// ─── Status Map ────────────────────────────────────────────────────────────────
const STATUS = {
  idle: { label: 'Ocioso', cls: 'badge-idle', icon: '⏸' },
  running: { label: 'Coletando...', cls: 'badge-running', icon: '▶️' },
  error: { label: 'Erro', cls: 'badge-error', icon: '❌' },
  paused: { label: 'Pausado', cls: 'badge-warning', icon: '⏸' },
};

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessages, setStatusMessages] = useState({});
  const { subscribe } = useWS();
  const toast = useToast();
  const navigate = useNavigate();

  const loadGroups = async () => {
    try {
      const res = await axios.get('/api/groups');
      setGroups(res.data);
    } catch (err) {
      toast.error('Erro ao carregar grupos');
    }
  };

  useEffect(() => {
    loadGroups();
    const unsub = subscribe((msg) => {
      if (msg.type === 'group_status') {
        setGroups((prev) =>
          prev.map((g) => g.id === msg.groupId ? { ...g, status: msg.status } : g)
        );
        if (msg.message) {
          setStatusMessages((s) => ({ ...s, [msg.groupId]: msg.message }));
        }
        if (msg.status === 'idle') {
          toast.success('Coleta concluída!');
          loadGroups();
        }
        if (msg.status === 'error') {
          toast.error(`Erro: ${msg.error || 'Falha na coleta'}`);
        }
      }
      if (msg.type === 'crawl_status') {
        setStatusMessages((s) => ({ ...s, [msg.groupId]: msg.message }));
      }
    });
    return unsub;
  }, []);

  const handleAddGroup = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      await axios.post('/api/groups', { url: url.trim() });
      setUrl('');
      toast.success('Grupo salvo! Abra-o na aba Facebook para coletar.');
      await loadGroups();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao adicionar grupo');
    } finally {
      setSubmitting(false);
    }
  };

  // Abre o grupo diretamente na aba Facebook (webview) para coleta
  const handleOpenInFacebook = (groupUrl) => {
    sessionStorage.setItem('fb_open_url', groupUrl);
    navigate('/facebook');
  };

  const handleDelete = async (groupId) => {
    if (!confirm('Remover este grupo?')) return;
    try {
      await axios.delete(`/api/groups/${groupId}`);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      toast.success('Grupo removido');
    } catch (err) {
      toast.error('Erro ao remover grupo');
    }
  };

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Grupos do Facebook</div>
          <div className="page-subtitle">Gerencie os grupos monitorados</div>
        </div>
      </div>

      {/* Add Group Form */}
      <div className="add-group-form">
        <h2>
          <span>➕</span>
          Adicionar Novo Grupo
        </h2>
        <form onSubmit={handleAddGroup}>
          <div className="input-row">
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Link do Grupo</label>
              <input
                id="group-url-input"
                className="input"
                type="url"
                placeholder="https://www.facebook.com/groups/nome-do-grupo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            <button
              id="btn-add-group"
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={submitting || !url}
            >
              {submitting ? '⏳ Salvando...' : '➕ Salvar Grupo'}
            </button>
          </div>
        </form>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          💡 Após salvar, clique em <strong>"🌐 Abrir e Coletar"</strong> para abrir o grupo na aba Facebook e iniciar a extração.
        </div>
      </div>

      {/* Groups List */}
      {groups.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Nenhum grupo cadastrado</div>
          <div style={{ color: 'var(--text-muted)' }}>
            Adicione o link de um grupo imobiliário do Facebook acima.
          </div>
        </div>
      ) : (
        <div className="groups-grid">
          {groups.map((group) => {
            const st = STATUS[group.status] || STATUS.idle;
            const statusMsg = statusMessages[group.id];
            return (
              <div key={group.id} className="group-card">
                <div className="group-card-header">
                  <div>
                    <a href={group.url} target="_blank" rel="noopener" className="group-card-url">
                      {group.url.replace('https://www.facebook.com/groups/', 'fb/groups/')}
                    </a>
                    {group.name && (
                      <div style={{ fontWeight: 600, marginTop: 4 }}>{group.name}</div>
                    )}
                  </div>
                  <span className={`badge ${st.cls}`}>
                    {st.icon} {st.label}
                  </span>
                </div>

                {statusMsg && group.status === 'running' && (
                  <div style={{
                    background: 'var(--bg-elevated)', borderRadius: 8,
                    padding: '8px 12px', fontSize: 12, color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', gap: 8
                  }}>
                    <span className="live-dot" />
                    {statusMsg}
                  </div>
                )}

                <div className="group-card-meta">
                  <span>🏠 {group._count?.posts || 0} posts</span>
                  {group.last_run && (
                    <span>
                      🕐 {format(new Date(group.last_run), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  )}
                </div>

                <div className="group-card-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenInFacebook(group.url)}
                    style={{ flex: 1 }}
                    title="Abre este grupo na aba Facebook para coletar"
                  >
                    🌐 Abrir e Coletar
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(group.id)}
                    disabled={group.status === 'running'}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toast.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
