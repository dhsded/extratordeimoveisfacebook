import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';

const isElectron = !!window.electronAPI;

// ─── Script injetado no webview para raspar posts ──────────────────────────
const SCRAPER_SCRIPT = `
(async () => {
  // ════════════════════════════════════════════════════════════════════════
  //  Sistema de timing genuinamente humano
  //  Humanos NÃO têm tempo uniforme entre ações:
  //   - Distribuição gaussiana (não uniforme)
  //   - Distrações ocasionais (longas pausas inesperadas)
  //   - Ritmo de leitura variável (às vezes rápido, às vezes devagar)
  //   - Scrolls para cima (relendo algo interessante)
  //   - Cada sessão tem uma "personalidade" (velocidade global)
  // ════════════════════════════════════════════════════════════════════════

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Distribuição gaussiana (Box-Muller) — muito mais realista que rand()
  // Humanos tendem a se concentrar em torno de um valor médio com caudas
  const gaussian = (mean, stdDev) => {
    let u, v;
    do {
      u = Math.random();
      v = Math.random();
    } while (u === 0 || v === 0);
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(0, mean + z * stdDev);
  };

  // Cada sessão tem velocidade própria — um usuário "rápido" ou "devagar"
  const SESSION_PACE = 0.6 + Math.random() * 0.9; // 0.6 = rápido, 1.5 = devagar

  // Delay humano: gaussiano + chance de distração + ritmo da sessão
  const humanDelay = async (baseMean, baseStdDev, ctx = '') => {
    let delay = gaussian(baseMean, baseStdDev) * SESSION_PACE;

    // 8% de chance de distração (olhou outra tela, atendeu telefone...)
    if (Math.random() < 0.08) {
      delay += gaussian(5000, 2000); // pausa longa inesperada
    }

    // 5% de chance de "skim" — passou rapidinho (como quando está entediado)
    if (Math.random() < 0.05) {
      delay *= 0.25;
    }

    await sleep(Math.max(50, Math.round(delay)));
  };

  // Clique humano: hesita, mexe o cursor (mouseover), clica
  const humanClick = async (el) => {
    await humanDelay(250, 100, 'pre-click');
    try {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await humanDelay(120, 60, 'hover');
      // 12% de chance de mover o mouse "ao redor" antes de clicar
      if (Math.random() < 0.12) {
        el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
        await humanDelay(180, 80, 'adjust');
      }
      el.click();
    } catch(e) {}
    await humanDelay(80, 40, 'post-click');
  };

  // Scroll suave com aceleração/desaceleração variável
  const humanScroll = async (distance) => {
    const steps = Math.floor(gaussian(9, 3));
    const clampedSteps = Math.max(4, Math.min(18, steps));
    const stepDist = distance / clampedSteps;

    for (let i = 0; i < clampedSteps; i++) {
      // Easing: acelera no início, desacelera no fim (como roda do mouse)
      const progress = i / clampedSteps;
      const easing = Math.sin(progress * Math.PI); // 0→1→0
      const speedFactor = 0.5 + easing * 1.5;

      const jitter = gaussian(0, 25); // variação por passo
      window.scrollBy(0, (stepDist + jitter) * speedFactor);
      await sleep(Math.max(20, Math.round(gaussian(70, 30) * SESSION_PACE)));
    }

    // Pausa de "leitura" após scroll — o quanto o usuário lê antes de continuar
    await humanDelay(650, 280, 'read-pause');
  };

  // ── Dados e controle ──────────────────────────────────────────────────────
  const results = [];
  const seen    = new Set();

  // 1. Clica Ver Mais — um a um, com timing humano individual
  const clickSeeMore = async () => {
    const btns = Array.from(document.querySelectorAll('[role="button"], [role="link"]'))
      .filter(el => {
        const t = (el.innerText || '').trim().toLowerCase();
        return t === 'ver mais' || t === 'see more' || t === 'ver mais...' || t.endsWith('ver mais');
      });

    for (const btn of btns) {
      // Cada botão tem seu próprio timing (não é previsível)
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

        const imgs = Array.from(art.querySelectorAll('img'))
          .map(i => i.src)
          .filter(s => s && s.includes('fbcdn') && !s.includes('emoji') && !s.includes('avatar'));

        batch.push({
          post_id:        postId,
          content:        text.substring(0, 6000),
          author_name:    authorLinks[0]?.innerText?.trim() || '',
          author_profile: authorLinks[0]?.href || '',
          post_url:       postUrl,
          image_urls:     JSON.stringify(imgs.slice(0, 8)),
        });
      } catch(e) {}
    }
    return batch;
  };

  // 3. Loop principal — comportamento de leitura real
  const MAX_SCROLLS = 25;
  let scrolls = 0;

  // Pausa inicial — simula o usuário orientando na página (tempo variável!)
  await humanDelay(1400, 600, 'page-load');

  while (scrolls < MAX_SCROLLS) {
    // Expande textos
    await clickSeeMore();
    await humanDelay(1200, 400, 'after-expand'); // aguarda renderização

    // Extrai
    const batch = extractPosts();
    batch.forEach(p => results.push(p));
    window.__scraperProgress = { scrolls, total: results.length };

    if (window.__scraperStop) break;

    // 15% de chance de scroll para CIMA (releitura — comportamento humano)
    if (Math.random() < 0.15) {
      await humanScroll(-(gaussian(300, 100)));
      await humanDelay(800, 400, 'backscroll-read');
    }

    // Scroll para baixo com distância variável
    const scrollDist = window.innerHeight * gaussian(1.8, 0.6);
    await humanScroll(Math.max(200, scrollDist));

    // Pausa entre scrolls com distribuição realista
    await humanDelay(1800, 700, 'between-scrolls');
    scrolls++;
  }

  return results;
})();
`;

// ─── Helpers ───────────────────────────────────────────────────────────────
const ts = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });
const groupIdFromUrl = (url) => url?.match(/groups\/([^/?]+)/)?.[1];

export default function FacebookBrowser() {
  const logEndRef   = useRef(null);
  const scrapingRef = useRef(false);

  // Lê URL enviada pela página de Grupos (via sessionStorage)
  const initialUrl = (() => {
    const saved = sessionStorage.getItem('fb_open_url');
    if (saved) { sessionStorage.removeItem('fb_open_url'); return saved; }
    return 'https://www.facebook.com';
  })();

  const [url, setUrl]               = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState('');
  const [loading, setLoading]       = useState(true);
  const [loggedIn, setLoggedIn]     = useState(false);
  const [savingSession, setSaving]  = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedCount, setScrapedCount] = useState(0);
  const [logs, setLogs]             = useState([]);
  const [showLog, setShowLog]       = useState(true);
  const [windowOpen, setWindowOpen] = useState(false);

  const addLog = useCallback((msg, type = 'info') => {
    setLogs(prev => [...prev.slice(-199), { msg, type, time: ts() }]);
  }, []);

  // Auto-scroll do log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Checa se usuário está logado no Facebook
  const checkLogin = async () => {
    if (!window.electronAPI?.facebook) return;
    const { loggedIn: li } = await window.electronAPI.facebook.isLoggedIn();
    setLoggedIn(li);
  };

  // Gerenciamento de abertura/fechamento da janela nativa do Facebook
  const handleOpenWindow = async (targetUrl = null) => {
    if (!window.electronAPI?.facebook) return;
    const openUrl = targetUrl || url || 'https://www.facebook.com';
    addLog(`🌐 Abrindo navegador secundário: ${openUrl}`, 'info');
    await window.electronAPI.facebook.open(openUrl);
    setWindowOpen(true);
  };

  const handleCloseWindow = async () => {
    if (!window.electronAPI?.facebook) return;
    addLog('🌐 Fechando navegador secundário...', 'warn');
    await window.electronAPI.facebook.close();
    setWindowOpen(false);
  };

  const handleBringToFront = async () => {
    if (!window.electronAPI?.facebook) return;
    await window.electronAPI.facebook.open(currentUrl || url);
  };

  // Sincroniza estado e eventos da janela nativa
  useEffect(() => {
    if (!window.electronAPI?.facebook) {
      setLoading(false);
      return;
    }

    const initWindow = async () => {
      setLoading(true);
      const isOpen = await window.electronAPI.facebook.isWindowOpen();
      setWindowOpen(isOpen);
      if (isOpen) {
        // Se a janela já está aberta, mas o usuário pediu para abrir um link de grupo específico vindo da aba de grupos:
        if (initialUrl && initialUrl !== 'https://www.facebook.com') {
          addLog(`🌐 Direcionando navegador para: ${initialUrl}`, 'info');
          await window.electronAPI.facebook.navigate(initialUrl);
          setCurrentUrl(initialUrl);
          setUrl(initialUrl);
        } else {
          const currUrl = await window.electronAPI.facebook.getUrl();
          if (currUrl) {
            setCurrentUrl(currUrl);
            setUrl(currUrl);
          }
        }
      } else {
        // Abre automaticamente se não estiver aberta
        await handleOpenWindow(initialUrl);
      }
      setLoading(false);
      await checkLogin();
    };

    initWindow();

    window.electronAPI.facebook.onNavigate((navUrl) => {
      setCurrentUrl(navUrl);
      setUrl(navUrl);
      checkLogin();
    });

    window.electronAPI.facebook.onClosed(() => {
      setWindowOpen(false);
      addLog('🌐 Janela do navegador do Facebook foi fechada.', 'warn');
    });
  }, []);

  // Auto-coleta se solicitado vindo da aba de grupos
  useEffect(() => {
    if (windowOpen && loggedIn && !isScraping) {
      const autoCollect = sessionStorage.getItem('fb_auto_collect');
      if (autoCollect === 'true') {
        sessionStorage.removeItem('fb_auto_collect');
        addLog('⏳ Aguardando carregamento completo do grupo para auto-coleta...', 'info');
        const timer = setTimeout(() => {
          handleStartScraping();
        }, 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [windowOpen, loggedIn, isScraping]);

  // ── Salvar sessão ──────────────────────────────────────────────────────────
  const handleSaveSession = async () => {
    if (!window.electronAPI?.facebook) return;
    setSaving(true);
    try {
      // Pega nome do usuário via JS na janela do Facebook
      let userName = '';
      try {
        userName = await window.electronAPI.facebook.executeJavaScript(`
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

    const isOpen = await window.electronAPI.facebook.isWindowOpen();
    if (!isOpen) {
      addLog('⚠️ Abra a janela do Facebook antes de iniciar a coleta.', 'warn');
      return;
    }

    const groupId = groupIdFromUrl(currentUrl);
    if (!groupId) {
      addLog('⚠️ Navegue até um Grupo do Facebook na janela antes de iniciar a coleta.', 'warn');
      return;
    }

    setIsScraping(true);
    scrapingRef.current = true;
    setScrapedCount(0);
    // Avisa o processo principal: impede suspensão do PC
    if (window.electronAPI?.scraping) await window.electronAPI.scraping.start();
    addLog(`🚀 Iniciando coleta no grupo: ${groupId}`, 'info');
    addLog('📖 Clicando em "Ver Mais" e rolando a página...', 'info');
    addLog('💡 Pode minimizar o programa — a coleta continua em segundo plano.', 'info');

    try {
      // Garante que o grupo existe no banco
      const groupRes = await axios.post('/api/groups', {
        url: currentUrl,
        name: groupId,
      }).catch(() => ({ data: { id: null } }));
      const dbGroupId = groupRes.data?.id || groupRes.data?.group?.id;

      // Injeta script de controle de parada
      await window.electronAPI.facebook.executeJavaScript('window.__scraperStop = false;');

      // Executa o scraper na janela secundária
      addLog('🔍 Extraindo posts da página (aguarde a conclusão)...', 'info');
      const posts = await window.electronAPI.facebook.executeJavaScript(SCRAPER_SCRIPT);

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
      // Libera o bloqueio de suspensão
      if (window.electronAPI?.scraping) await window.electronAPI.scraping.stop().catch(() => {});
    }
  };

  const handleStopScraping = async () => {
    try { await window.electronAPI.facebook.executeJavaScript('window.__scraperStop = true;'); } catch (_) {}
    scrapingRef.current = false;
    setIsScraping(false);
    addLog('⏹️ Coleta interrompida pelo usuário.', 'warn');
  };

  const navigate = (dest) => {
    setUrl(dest);
    if (windowOpen && window.electronAPI?.facebook) {
      window.electronAPI.facebook.navigate(dest);
    }
  };
  
  const handleUrlKey = (e) => { if (e.key === 'Enter') navigate(url); };
  const isInGroup = !!groupIdFromUrl(currentUrl);

  const handleGoBack = () => window.electronAPI?.facebook?.goBack();
  const handleGoForward = () => window.electronAPI?.facebook?.goForward();
  const handleReload = () => window.electronAPI?.facebook?.reload();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Barra de Navegação ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <button className="btn btn-secondary btn-sm" onClick={handleGoBack} disabled={!windowOpen}>◀</button>
        <button className="btn btn-secondary btn-sm" onClick={handleGoForward} disabled={!windowOpen}>▶</button>
        <button className="btn btn-secondary btn-sm" onClick={handleReload} disabled={!windowOpen}>🔄</button>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('https://www.facebook.com')}>🏠</button>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('https://www.facebook.com/groups/feed/')}>👥 Grupos</button>

        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={handleUrlKey}
          disabled={!windowOpen}
          style={{
            flex: 1, minWidth: 200, background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '5px 10px', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
            opacity: windowOpen ? 1 : 0.5,
          }}
        />

        {loading && <span style={{ fontSize: 12, color: 'var(--warning)' }}>⏳</span>}

        {/* Login status */}
        {windowOpen && !loggedIn && (
          <span style={{
            fontSize: 12, color: 'var(--warning)', background: 'rgba(255,200,0,0.1)',
            padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
          }}>⚠️ Faça login no Facebook</span>
        )}

        {/* Salvar sessão */}
        {isElectron && loggedIn && windowOpen && (
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
        {isInGroup && windowOpen && (
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

      {/* ── Área Principal: Painel Central + Log ─────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Painel Central */}
        {isElectron ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 20, background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', padding: 40, textAlign: 'center'
          }}>
            {windowOpen ? (
              <>
                <div style={{ fontSize: 64, animation: 'pulse 2s infinite' }}>🌐</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>Navegador do Facebook Ativo</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 450, lineHeight: 1.5 }}>
                  Acesse a janela separada do Facebook para navegar e fazer login. 
                  As opções de coleta e os logs em tempo real estão localizados aqui nesta aba.
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleBringToFront}>
                    🖥️ Trazer Janela para Frente
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={handleCloseWindow}>
                    ❌ Fechar Janela
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 64, opacity: 0.5 }}>🌐</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>Navegador do Facebook Oculto</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 450, lineHeight: 1.5 }}>
                  A janela separada do Facebook está fechada. Abra-a para navegar e iniciar a coleta automática.
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenWindow()} style={{ marginTop: 10 }}>
                  🌐 Abrir Navegador do Facebook
                </button>
              </>
            )}
          </div>
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
