import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const isElectron = !!window.electronAPI;

export default function Sessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [webviewStatus, setWebviewStatus] = useState(null); // null | 'checking' | true | false

  const loadSessions = () => {
    axios.get('/api/sessions')
      .then(r => setSessions(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const checkWebviewLogin = async () => {
    if (!window.electronAPI?.facebook) return;
    setWebviewStatus('checking');
    const { loggedIn } = await window.electronAPI.facebook.isLoggedIn();
    setWebviewStatus(loggedIn);
  };

  useEffect(() => {
    loadSessions();
    checkWebviewLogin();
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Remover esta sessão?')) return;
    await axios.delete(`/api/sessions/${id}`);
    loadSessions();
  };

  const activeSessions  = sessions.filter(s => s.status === 'active');
  const expiredSessions = sessions.filter(s => s.status !== 'active');

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Sessões do Facebook</div>
          <div className="page-subtitle">Contas conectadas e status de acesso</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => { loadSessions(); checkWebviewLogin(); }}>
            🔄 Atualizar
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/facebook')}>
            🌐 Ir para aba Facebook
          </button>
        </div>
      </div>

      {/* ── Status do navegador embutido ─────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
          🌐 Navegador Embutido
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: webviewStatus === true ? 'var(--success)'
                        : webviewStatus === false ? 'var(--danger)'
                        : 'var(--text-muted)',
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {webviewStatus === 'checking' ? 'Verificando...'
                 : webviewStatus === true  ? '✅ Sessão ativa no Facebook'
                 : webviewStatus === false ? '❌ Não está logado'
                 : '— Verificando status...'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {webviewStatus === true
                  ? 'O navegador embutido tem uma sessão ativa. Acesse a aba Facebook para coletar imóveis.'
                  : 'Acesse a aba "🌐 Facebook" no menu lateral, faça login e clique em "💾 Salvar Conta".'}
              </div>
            </div>
          </div>

          {webviewStatus !== true && (
            <button
              className="btn btn-primary"
              onClick={() => navigate('/facebook')}
            >
              🔐 Fazer Login
            </button>
          )}
        </div>

        {/* Instrução passo a passo */}
        {webviewStatus === false && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 8,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            fontSize: 13, lineHeight: 2,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Como fazer login:</div>
            <div>1️⃣ Clique em <strong>"🔐 Fazer Login"</strong> acima (ou <strong>"🌐 Facebook"</strong> no menu)</div>
            <div>2️⃣ Faça login normalmente no Facebook dentro do programa</div>
            <div>3️⃣ Após entrar, clique no botão <strong>"💾 Salvar Conta"</strong> que aparecerá</div>
            <div>4️⃣ Volte aqui e clique <strong>"Atualizar"</strong> para ver sua conta ativa</div>
          </div>
        )}
      </div>

      {/* ── Contas Ativas ────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
      ) : (
        <>
          {/* Resumo */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <div className="card card-sm" style={{ flex: 1, minWidth: 160, textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--success)' }}>{activeSessions.length}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Conta(s) ativa(s)</div>
            </div>
            <div className="card card-sm" style={{ flex: 1, minWidth: 160, textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-secondary)' }}>{sessions.length}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total de contas</div>
            </div>
            <div className="card card-sm" style={{ flex: 1, minWidth: 160, textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--warning)' }}>{expiredSessions.length}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Inativas/Expiradas</div>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Nenhuma conta salva</div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
                Faça login na aba Facebook e clique em "Salvar Conta"
              </div>
              <button className="btn btn-primary" onClick={() => navigate('/facebook')}>
                🌐 Ir para aba Facebook
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sessions.map(s => (
                <div key={s.id} className="card card-sm" style={{
                  display: 'flex', gap: 16, alignItems: 'center',
                  borderLeft: `3px solid ${s.status === 'active' ? 'var(--success)' : 'var(--border)'}`,
                }}>
                  {/* Avatar placeholder */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: s.status === 'active' ? 'var(--accent)' : 'var(--bg-elevated)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, flexShrink: 0,
                  }}>
                    {s.status === 'active' ? '✅' : '👤'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                      {s.profile_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📁 {s.profile_dir}
                    </div>
                    {s.last_login && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        🕐 Último login: {format(new Date(s.last_login), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                    )}
                  </div>

                  <span className={`badge ${
                    s.status === 'active'  ? 'badge-success' :
                    s.status === 'expired' ? 'badge-warning' : 'badge-idle'
                  }`}>
                    {s.status === 'active' ? '● ativa' : s.status === 'expired' ? '⚠ expirada' : '○ inativa'}
                  </span>

                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(s.id)}
                    title="Remover conta"
                  >🗑️</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
