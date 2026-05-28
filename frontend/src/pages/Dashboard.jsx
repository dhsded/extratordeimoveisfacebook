import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { useWS } from '../context/WSContext';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

const CUSTOM_TOOLTIP = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e2a40', border: '1px solid #2a3555',
      borderRadius: 8, padding: '8px 14px', fontSize: 13
    }}>
      <strong style={{ color: '#f1f5f9' }}>{payload[0].name}</strong>
      <div style={{ color: '#94a3b8' }}>{payload[0].value} posts</div>
    </div>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentPosts, setRecentPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { subscribe } = useWS();

  const loadStats = async () => {
    try {
      const [statsRes, postsRes] = await Promise.all([
        axios.get('/api/posts/stats/summary'),
        axios.get('/api/posts?limit=5&sort=scraped_at&order=desc'),
      ]);
      setStats(statsRes.data);
      setRecentPosts(postsRes.data.data);
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // Atualiza quando novos posts chegam via WS
    const unsub = subscribe((msg) => {
      if (msg.type === 'new_post') loadStats();
    });
    return unsub;
  }, []);

  if (loading) return <div className="page"><div style={{ color: 'var(--text-muted)' }}>Carregando...</div></div>;

  const byTypeData = (stats?.byType || [])
    .filter((t) => t.property_type)
    .map((t) => ({ name: t.property_type, value: t._count }));

  const byTransData = (stats?.byTransaction || [])
    .filter((t) => t.transaction_type)
    .map((t) => ({ name: t.transaction_type, value: t._count }));

  const byCityData = (stats?.byCity || [])
    .filter((c) => c.city)
    .map((c) => ({ name: c.city, value: c._count }));

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Visão geral da coleta de imóveis</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
          <span className="live-dot" />
          Atualização em tempo real
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card" style={{ '--accent-glow': 'rgba(59,130,246,0.2)' }}>
          <div className="stat-icon">🏠</div>
          <div className="stat-label">Total de Imóveis</div>
          <div className="stat-value">{stats?.total?.toLocaleString('pt-BR') || 0}</div>
          <div className="stat-sub">posts coletados</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-label">Últimas 24h</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>
            {stats?.recentCount?.toLocaleString('pt-BR') || 0}
          </div>
          <div className="stat-sub">novos registros</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏙️</div>
          <div className="stat-label">Cidades</div>
          <div className="stat-value" style={{ color: 'var(--purple)' }}>
            {stats?.byCity?.length || 0}
          </div>
          <div className="stat-sub">cidades mapeadas</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-label">Tipos de Imóvel</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>
            {byTypeData.length}
          </div>
          <div className="stat-sub">categorias</div>
        </div>
      </div>

      {/* Charts */}
      <div className="chart-grid">
        {/* Tipo de Imóvel */}
        {byTypeData.length > 0 && (
          <div className="chart-card">
            <div className="chart-title">Tipo de Imóvel</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byTypeData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                  dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {byTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CUSTOM_TOOLTIP />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Transação */}
        {byTransData.length > 0 && (
          <div className="chart-card">
            <div className="chart-title">Tipo de Transação</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byTransData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                  dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {byTransData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CUSTOM_TOOLTIP />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top Cidades */}
        {byCityData.length > 0 && (
          <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
            <div className="chart-title">Top Cidades</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byCityData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CUSTOM_TOOLTIP />} />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Posts Recentes */}
      {recentPosts.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Posts Recentes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recentPosts.map((post) => (
              <div key={post.id} style={{
                background: 'var(--bg-elevated)', borderRadius: 10,
                padding: '12px 16px', display: 'flex', gap: 16, alignItems: 'flex-start'
              }}>
                <div style={{ fontSize: 22 }}>
                  {post.property_type === 'apartamento' ? '🏢' :
                   post.property_type === 'casa' ? '🏡' :
                   post.property_type === 'terreno' ? '🌳' : '🏠'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {post.content?.substring(0, 120) || '(sem conteúdo)'}...
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                    {post.city && <span>📍 {post.city}</span>}
                    {post.price && <span>💰 R$ {parseFloat(post.price).toLocaleString('pt-BR')}</span>}
                    {post.phone && <span>📱 {post.phone}</span>}
                    <span>⏱️ {new Date(post.scraped_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                {post.transaction_type && (
                  <span className={`badge badge-${post.transaction_type === 'venda' ? 'success' : 'warning'}`}>
                    {post.transaction_type}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {stats?.total === 0 && (
        <div className="card" style={{ marginTop: 24, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Nenhum imóvel coletado ainda</div>
          <div style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
            Adicione um grupo do Facebook e clique em Executar para começar.
          </div>
          <a href="/groups" className="btn btn-primary">Adicionar Grupo</a>
        </div>
      )}
    </div>
  );
}
