import { useEffect, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/sessions')
      .then((r) => setSessions(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Sessões do Browser</div>
          <div className="page-subtitle">Perfis salvos do Chromium</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>🔐 Como fazer login</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div>1. Abra o terminal no diretório do projeto</div>
          <div>2. Execute: <code style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4, color: 'var(--accent)' }}>npm run login</code></div>
          <div>3. O browser abrirá — faça login no Facebook normalmente</div>
          <div>4. Quando terminar, pressione ENTER no terminal</div>
          <div>5. A sessão será salva automaticamente aqui</div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
      ) : sessions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Nenhuma sessão salva</div>
          <div style={{ color: 'var(--text-muted)' }}>Execute <code>npm run login</code> para fazer login.</div>
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
                {s.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
