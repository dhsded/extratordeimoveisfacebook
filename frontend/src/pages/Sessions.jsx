import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loginState, setLoginState] = useState('idle'); // idle | connecting | waiting | success | error
  const [loginLog, setLoginLog] = useState([]);
  const evtRef = useRef(null);
  const logEndRef = useRef(null);

  const loadSessions = () => {
    axios.get('/api/sessions')
      .then((r) => setSessions(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSessions();
    return () => { if (evtRef.current) evtRef.current.abort(); };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [loginLog]);

  const handleLogin = async () => {
    if (loginState === 'connecting' || loginState === 'waiting') return;

    setLoginState('connecting');
    setLoginLog([]);

    // Inicia login via SSE
    const controller = new AbortController();
    evtRef.current = controller;

    try {
      const res = await fetch('/api/sessions/login', {
        method: 'POST',
        signal: controller.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data:'));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(5));
            if (data.type === 'done') {
              loadSessions();
              break;
            }
            setLoginLog(prev => [...prev, { msg: data.msg, type: data.type }]);
            if (data.type === 'waiting') setLoginState('waiting');
            if (data.type === 'success') { setLoginState('success'); loadSessions(); }
            if (data.type === 'error') setLoginState('error');
          } catch (_) {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setLoginLog(prev => [...prev, { msg: `Erro: ${err.message}`, type: 'error' }]);
        setLoginState('error');
      }
    }
  };

  const handleDeleteSession = async (id) => {
    if (!confirm('Remover esta sessão?')) return;
    await axios.delete(`/api/sessions/${id}`);
    loadSessions();
  };

  const activeSession = sessions.find(s => s.status === 'active');

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Sessões do Facebook</div>
          <div className="page-subtitle">Faça login para iniciar a coleta de imóveis</div>
        </div>
      </div>

      {/* Login Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              {activeSession ? '✅ Sessão ativa' : '🔐 Fazer login no Facebook'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {activeSession
                ? `Logado como: ${activeSession.profile_name} — último login: ${format(new Date(activeSession.last_login), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                : 'Clique no botão para abrir o navegador e fazer login'}
            </div>
          </div>
          <button
            id="btn-facebook-login"
            className={`btn ${loginState === 'success' ? 'btn-success' : 'btn-primary'} btn-lg`}
            onClick={handleLogin}
            disabled={loginState === 'connecting' || loginState === 'waiting'}
            style={{ minWidth: 200 }}
          >
            {loginState === 'idle' && '🔐 Fazer Login no Facebook'}
            {loginState === 'connecting' && '⏳ Abrindo navegador...'}
            {loginState === 'waiting' && '⏳ Aguardando login...'}
            {loginState === 'success' && '✅ Login realizado!'}
            {loginState === 'error' && '🔄 Tentar novamente'}
          </button>
        </div>

        {/* Log de progresso */}
        {loginLog.length > 0 && (
          <div style={{
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            padding: 16,
            maxHeight: 200,
            overflowY: 'auto',
            fontSize: 13,
            fontFamily: 'monospace',
          }}>
            {loginLog.map((entry, i) => (
              <div key={i} style={{
                color: entry.type === 'success' ? 'var(--success)'
                  : entry.type === 'error' ? 'var(--danger)'
                  : entry.type === 'waiting' ? 'var(--warning)'
                  : 'var(--text-secondary)',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {entry.type === 'waiting' && <span className="live-dot" />}
                {entry.msg}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {(loginState === 'connecting' || loginState === 'waiting') && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            💡 <strong>Instruções:</strong> Uma janela do Chromium vai abrir com o Facebook.
            Faça login normalmente (usuário, senha, 2FA se necessário).
            Após entrar, a sessão será salva automaticamente.
          </div>
        )}
      </div>

      {/* Lista de Sessões */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
      ) : sessions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Nenhuma sessão salva</div>
          <div style={{ color: 'var(--text-muted)' }}>Faça login acima para começar a coletar imóveis.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sessions.map((s) => (
            <div key={s.id} className="card card-sm" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ fontSize: 36 }}>
                {s.status === 'active' ? '✅' : s.status === 'expired' ? '⚠️' : '⏸'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{s.profile_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.profile_dir}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                {s.last_login && (
                  <div>Último login: {format(new Date(s.last_login), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
                )}
              </div>
              <span className={`badge ${
                s.status === 'active' ? 'badge-success' :
                s.status === 'expired' ? 'badge-warning' : 'badge-idle'
              }`}>
                {s.status === 'active' ? 'ativo' : s.status === 'expired' ? 'expirado' : 'inativo'}
              </span>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDeleteSession(s.id)}
                title="Remover sessão"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
