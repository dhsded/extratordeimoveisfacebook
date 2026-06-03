import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

export default function FacebookBrowser() {
  const webviewRef = useRef(null);
  const [url, setUrl] = useState('https://www.facebook.com');
  const [currentUrl, setCurrentUrl] = useState('https://www.facebook.com');
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const isElectron = !!window.electronAPI;

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const onStart  = () => setLoading(true);
    const onStop   = () => { setLoading(false); checkLogin(); };
    const onNav    = (e) => { setCurrentUrl(e.url); setUrl(e.url); };

    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-navigate', onNav);
    wv.addEventListener('did-navigate-in-page', onNav);

    return () => {
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-navigate', onNav);
      wv.removeEventListener('did-navigate-in-page', onNav);
    };
  }, []);

  const checkLogin = async () => {
    if (!window.electronAPI?.facebook) return;
    const result = await window.electronAPI.facebook.isLoggedIn();
    setLoggedIn(result.loggedIn);
  };

  const handleSaveSession = async () => {
    if (!window.electronAPI?.facebook) return;
    setSavingSession(true);
    try {
      const { ok, cookies } = await window.electronAPI.facebook.getCookies();
      if (ok && cookies.length > 0) {
        await axios.post('/api/sessions/cookies', { cookies });
        setSessionSaved(true);
        setTimeout(() => setSessionSaved(false), 4000);
      }
    } catch (err) {
      console.error('Erro ao salvar sessão:', err);
    } finally {
      setSavingSession(false);
    }
  };

  const navigate = (dest) => {
    setUrl(dest);
    webviewRef.current?.loadURL(dest);
  };

  const handleUrlKey = (e) => {
    if (e.key === 'Enter') navigate(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* Barra de navegação */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Botões nav */}
        <button className="btn btn-secondary btn-sm" onClick={() => webviewRef.current?.goBack()}  title="Voltar">◀</button>
        <button className="btn btn-secondary btn-sm" onClick={() => webviewRef.current?.goForward()} title="Avançar">▶</button>
        <button className="btn btn-secondary btn-sm" onClick={() => webviewRef.current?.reload()} title="Recarregar">🔄</button>

        {/* Atalhos */}
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('https://www.facebook.com')}>🏠 Início</button>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('https://www.facebook.com/groups/feed/')}>👥 Grupos</button>

        {/* Barra de URL */}
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={handleUrlKey}
          style={{
            flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 12px', color: 'var(--text-primary)',
            fontSize: 13, outline: 'none',
          }}
        />

        {/* Loading indicator */}
        {loading && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏳</span>}

        {/* Salvar sessão */}
        {isElectron && loggedIn && (
          <button
            className={`btn ${sessionSaved ? 'btn-success' : 'btn-primary'} btn-sm`}
            onClick={handleSaveSession}
            disabled={savingSession}
            title="Salvar login para o extrator usar"
          >
            {savingSession ? '⏳' : sessionSaved ? '✅ Salvo!' : '💾 Salvar Login'}
          </button>
        )}

        {isElectron && !loggedIn && (
          <span style={{ fontSize: 12, color: 'var(--warning)', whiteSpace: 'nowrap' }}>
            ⚠️ Faça login
          </span>
        )}
      </div>

      {/* WebView do Facebook */}
      {isElectron ? (
        <webview
          ref={webviewRef}
          src="https://www.facebook.com"
          partition="persist:facebook"
          style={{ flex: 1, width: '100%', border: 'none' }}
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
          allowpopups="false"
        />
      ) : (
        /* Fallback para quando roda no browser normal (não Electron) */
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16, color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: 64 }}>🖥️</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Disponível apenas no app desktop</div>
          <div style={{ fontSize: 14 }}>
            Execute o programa via <code style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4 }}>Iniciar.bat</code> para usar esta funcionalidade.
          </div>
          <a href="https://www.facebook.com/groups/feed/" target="_blank" rel="noopener"
            className="btn btn-primary">
            Abrir Facebook no navegador →
          </a>
        </div>
      )}
    </div>
  );
}
