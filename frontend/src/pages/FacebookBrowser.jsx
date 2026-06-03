import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';

const isElectron = !!window.electronAPI;

// ─── Script injetado no webview para raspar posts ──────────────────────────
const SCRAPER_SCRIPT = `
(async () => {
  // ── Helpers de comportamento humano ─────────────────────────────────────
  const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Scroll suave que simula leitura humana (acelera, desacelera)
  const humanScroll = async (distance) => {
    const steps = rand(6, 14);
    const stepDist = distance / steps;
    for (let i = 0; i < steps; i++) {
      const jitter = rand(-30, 30);
      window.scrollBy(0, stepDist + jitter);
      await sleep(rand(40, 120));
    }
    // Pausa de "leitura" aleatória
    await sleep(rand(400, 900));
  };

  // Clica em um elemento com pequeno delay humano
  const humanClick = async (el) => {
    await sleep(rand(120, 380));
    try {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(rand(60, 200));
      el.click();
    } catch(e) {}
  };

  const results = [];
  const seen    = new Set();

  // 1. Clica um a um em todos os "Ver Mais" visíveis
  const clickSeeMore = async () => {
    const btns = Array.from(document.querySelectorAll('[role="button"], [role="link"]'))
      .filter(el => {
        const t = (el.innerText || '').trim().toLowerCase();
        return t === 'ver mais' || t === 'see more' || t === 'ver mais...' || t.endsWith('ver mais');
      });
    for (const btn of btns) {
      await humanClick(btn);
    }
    return btns.length;
  };

  // 2. Extrai posts da página atual
  const extractPosts = () => {
    const articles = Array.from(document.querySelectorAll('[role="article"]'));
    const batch = [];
    for (const art of articles) {
      try {
        const textEls = art.querySelectorAll(
          '[data-ad-comet-preview="message"], [data-ad-preview="message"]'
        );
        let text = textEls.length > 0
          ? Array.from(textEls).map(e => e.innerText).join('\\n')
          : art.innerText;
        if (!text || text.length < 15) continue;

        const postLink = art.querySelector(
          'a[href*="/posts/"], a[href*="story_fbid="], a[href*="/permalink/"], a[href*="?__story_fbid"]'
        );
        const postUrl = postLink ? postLink.href : '';
        const postId  = (postUrl.match(/\\d{12,}/) || [Date.now().toString() + Math.random()])[0];
        if (seen.has(postId)) continue;
        seen.add(postId);

        const authorLinks = Array.from(art.querySelectorAll('a[role="link"]'))
          .filter(a => a.href && a.href.includes('facebook.com')
                    && !a.href.includes('/groups/')
                    && !a.href.includes('/posts/'));
        const authorName    = authorLinks[0]?.innerText?.trim() || '';
        const authorProfile = authorLinks[0]?.href || '';

        const imgs = Array.from(art.querySelectorAll('img'))
          .map(i => i.src)
          .filter(s => s && s.includes('fbcdn') && !s.includes('emoji') && !s.includes('avatar'));

        batch.push({
          post_id:        postId,
          content:        text.substring(0, 6000),
          author_name:    authorName,
          author_profile: authorProfile,
          post_url:       postUrl,
          image_urls:     JSON.stringify(imgs.slice(0, 8)),
        });
      } catch(e) {}
    }
    return batch;
  };

  // 3. Loop principal: clicar Ver Mais → extrair → scroll humano
  let scrolls    = 0;
  const MAX_SCROLLS = 25;

  // Pausa inicial — simula o usuário chegando na página
  await sleep(rand(800, 1800));

  while (scrolls < MAX_SCROLLS) {
    await clickSeeMore();
    await sleep(rand(900, 1600)); // aguarda expansão dos textos

    const batch = extractPosts();
    batch.forEach(p => results.push(p));
    window.__scraperProgress = { scrolls, total: results.length };

    if (window.__scraperStop) break;

    // Scroll com distância variável — simula leitura
    const scrollDist = window.innerHeight * (1.5 + Math.random() * 1.5);
    await humanScroll(scrollDist);

    // Pausa entre scrolls — varia como humano lendo
    await sleep(rand(1200, 2800));
    scrolls++;
  }

  return results;
})();
`;

// ─── Helpers ───────────────────────────────────────────────────────────────
const ts = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });
const groupIdFromUrl = (url) => url?.match(/groups\/([^/?]+)/)?.[1];

export default function FacebookBrowser() {
  const webviewRef  = useRef(null);
  const logEndRef   = useRef(null);
  const scrapingRef = useRef(false);

  const [url, setUrl]               = useState('https://www.facebook.com');
  const [currentUrl, setCurrentUrl] = useState('');
  const [loading, setLoading]       = useState(true);
  const [loggedIn, setLoggedIn]     = useState(false);
  const [savingSession, setSaving]  = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedCount, setScrapedCount] = useState(0);
  const [logs, setLogs]             = useState([]);
  const [showLog, setShowLog]       = useState(true);

  const addLog = useCallback((msg, type = 'info') => {
    setLogs(prev => [...prev.slice(-199), { msg, type, time: ts() }]);
  }, []);

  // Auto-scroll do log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Eventos do webview
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const onStart = () => setLoading(true);
    const onStop  = () => { setLoading(false); checkLogin(); };
    const onNav   = (e) => { setCurrentUrl(e.url); setUrl(e.url); };

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
    const { loggedIn: li } = await window.electronAPI.facebook.isLoggedIn();
    setLoggedIn(li);
  };

  // ── Salvar sessão ──────────────────────────────────────────────────────────
  const handleSaveSession = async () => {
    if (!window.electronAPI?.facebook) return;
    setSaving(true);
    try {
      // Pega nome do usuário via JS no webview
      let userName = '';
      try {
        userName = await webviewRef.current.executeJavaScript(`
          (() => {
            const sel = [
              '[aria-label*="your profile"] span',
              '[data-testid="blue_bar_profile_link"] span',
              'a[aria-label*="profile"] span'
            ];
            for (const s of sel) {
              const el = document.querySelector(s);
              if (el && el.textContent.trim()) return el.textContent.trim();
            }
            return '';
          })();
        `);
      } catch (_) {}

      const { ok, cookies } = await window.electronAPI.facebook.getCookies();
      if (ok && cookies.length > 0) {
        const cUser = cookies.find(c => c.name === 'c_user');
        await axios.post('/api/sessions/cookies', {
          cookies,
          profileName: userName || `Conta FB ${cUser?.value || ''}`,
        });
        setSessionSaved(true);
        addLog(`✅ Sessão salva: ${userName || 'Conta Facebook'}`, 'success');
        setTimeout(() => setSessionSaved(false), 4000);
      }
    } catch (err) {
      addLog(`❌ Erro ao salvar: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Iniciar Coleta ─────────────────────────────────────────────────────────
  const handleStartScraping = async () => {
    if (isScraping) return;

    const groupId = groupIdFromUrl(currentUrl);
    if (!groupId) {
      addLog('⚠️ Navegue até um Grupo do Facebook antes de iniciar a coleta.', 'warn');
      return;
    }

    setIsScraping(true);
    scrapingRef.current = true;
    setScrapedCount(0);
    addLog(`🚀 Iniciando coleta no grupo: ${groupId}`, 'info');
    addLog('📖 Clicando em "Ver Mais" e rolando a página...', 'info');

    try {
      // Garante que o grupo existe no banco
      const groupRes = await axios.post('/api/groups', {
        url: currentUrl,
        name: groupId,
      }).catch(() => ({ data: { id: null } }));
      const dbGroupId = groupRes.data?.id || groupRes.data?.group?.id;

      // Injeta script de controle de parada
      await webviewRef.current.executeJavaScript('window.__scraperStop = false;');

      // Executa o scraper no webview
      addLog('🔍 Extraindo posts da página...', 'info');
      const posts = await webviewRef.current.executeJavaScript(SCRAPER_SCRIPT);

      addLog(`📦 ${posts.length} posts encontrados. Filtrando e salvando...`, 'info');

      let saved = 0;
      let skipped = 0;
      for (const post of posts) {
        if (!scrapingRef.current) break;
        try {
          await axios.post('/api/posts/raw', { ...post, group_id: dbGroupId, group_url: currentUrl });
          saved++;
          setScrapedCount(saved);
          if (saved % 5 === 0) addLog(`💾 ${saved} posts salvos...`, 'info');
        } catch (e) {
          if (e.response?.status === 409) skipped++;
          else addLog(`⚠️ Post ignorado: ${e.message}`, 'warn');
        }
      }

      addLog(`✅ Coleta concluída! ${saved} salvos, ${skipped} já existiam.`, 'success');
    } catch (err) {
      addLog(`❌ Erro na coleta: ${err.message}`, 'error');
    } finally {
      setIsScraping(false);
      scrapingRef.current = false;
    }
  };

  const handleStopScraping = async () => {
    try { await webviewRef.current.executeJavaScript('window.__scraperStop = true;'); } catch (_) {}
    scrapingRef.current = false;
    setIsScraping(false);
    addLog('⏹️ Coleta interrompida pelo usuário.', 'warn');
  };

  const navigate = (dest) => { setUrl(dest); webviewRef.current?.loadURL(dest); };
  const handleUrlKey = (e) => { if (e.key === 'Enter') navigate(url); };
  const isInGroup = !!groupIdFromUrl(currentUrl);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Barra de Navegação ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <button className="btn btn-secondary btn-sm" onClick={() => webviewRef.current?.goBack()}>◀</button>
        <button className="btn btn-secondary btn-sm" onClick={() => webviewRef.current?.goForward()}>▶</button>
        <button className="btn btn-secondary btn-sm" onClick={() => webviewRef.current?.reload()}>🔄</button>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('https://www.facebook.com')}>🏠</button>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('https://www.facebook.com/groups/feed/')}>👥 Grupos</button>

        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={handleUrlKey}
          style={{
            flex: 1, minWidth: 200, background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '5px 10px', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
          }}
        />

        {loading && <span style={{ fontSize: 12, color: 'var(--warning)' }}>⏳</span>}

        {/* Login status */}
        {!loggedIn && (
          <span style={{
            fontSize: 12, color: 'var(--warning)', background: 'rgba(255,200,0,0.1)',
            padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
          }}>⚠️ Faça login no Facebook</span>
        )}

        {/* Salvar sessão */}
        {isElectron && loggedIn && (
          <button
            className={`btn ${sessionSaved ? 'btn-success' : 'btn-primary'} btn-sm`}
            onClick={handleSaveSession}
            disabled={savingSession}
            title="Salva a sessão para o extrator usar"
          >
            {savingSession ? '⏳' : sessionSaved ? '✅ Salvo!' : '💾 Salvar Conta'}
          </button>
        )}

        {/* Botão Coletar / Parar */}
        {isInGroup && (
          isScraping ? (
            <button className="btn btn-danger btn-sm" onClick={handleStopScraping}>
              ⏹️ Parar ({scrapedCount})
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleStartScraping}
              disabled={!loggedIn}
              title={!loggedIn ? 'Faça login primeiro' : 'Extrair imóveis deste grupo'}
            >
              🔍 Coletar Imóveis
            </button>
          )
        )}

        {/* Toggle log */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowLog(v => !v)}
          title="Mostrar/ocultar log"
        >
          {showLog ? '🔼 Log' : '🔽 Log'}
        </button>
      </div>

      {/* ── Área Principal: Webview + Log ─────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Webview */}
        {isElectron ? (
          <webview
            ref={webviewRef}
            src="https://www.facebook.com"
            partition="persist:facebook"
            style={{ flex: 1, border: 'none', minWidth: 0 }}
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            allowpopups="false"
          />
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 16, color: 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 64 }}>🖥️</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Disponível apenas no app desktop</div>
            <div style={{ fontSize: 14 }}>Execute o programa via <code style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4 }}>Iniciar.bat</code></div>
          </div>
        )}

        {/* Painel de Log */}
        {showLog && (
          <div style={{
            width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontWeight: 700, fontSize: 13,
            }}>
              <span>📋 Log de Coleta {scrapedCount > 0 && <span style={{ color: 'var(--accent)' }}>({scrapedCount})</span>}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setLogs([])}
                style={{ fontSize: 11, padding: '2px 8px' }}
              >Limpar</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>
                  {isInGroup
                    ? '👆 Clique em "Coletar Imóveis" para iniciar'
                    : '👆 Navegue até um Grupo do Facebook'}
                </div>
              ) : (
                logs.map((entry, i) => (
                  <div key={i} style={{
                    marginBottom: 5, display: 'flex', gap: 6, alignItems: 'flex-start',
                    color: entry.type === 'success' ? 'var(--success)'
                         : entry.type === 'error'   ? 'var(--danger)'
                         : entry.type === 'warn'    ? 'var(--warning)'
                         : 'var(--text-secondary)',
                    lineHeight: 1.4,
                  }}>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{entry.time}</span>
                    <span>{entry.msg}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>

            {isScraping && (
              <div style={{
                padding: '8px 14px', borderTop: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              }}>
                <span className="live-dot" style={{ flexShrink: 0 }} />
                <span style={{ color: 'var(--accent)' }}>Coletando... {scrapedCount} posts salvos</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
