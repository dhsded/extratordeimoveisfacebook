import { useEffect, useState } from 'react';
import axios from 'axios';

const PROPERTY_TYPES = [
  { value: 'casa', label: '🏠 Casa' },
  { value: 'apartamento', label: '🏢 Apartamento' },
  { value: 'terreno', label: '🌿 Terreno / Lote' },
  { value: 'comercial', label: '🏪 Sala Comercial' },
  { value: 'kitnet', label: '🛏️ Kitnet / Studio' },
  { value: 'chacara', label: '🌳 Chácara / Sítio' },
];

const BEDROOM_OPTIONS = [
  { value: null, label: 'Qualquer' },
  { value: 1, label: '1+' },
  { value: 2, label: '2+' },
  { value: 3, label: '3+' },
  { value: 4, label: '4+' },
];

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
    }
    setInput('');
  };

  const removeTag = (tag) => onChange(tags.filter(t => t !== tag));

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 12px',
      border: '1px solid var(--border)' }}>
      {tags.map(tag => (
        <span key={tag} style={{
          background: 'var(--accent)', color: '#fff', borderRadius: 20,
          padding: '2px 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6
        }}>
          {tag}
          <button onClick={() => removeTag(tag)} style={{
            background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
            fontSize: 14, lineHeight: 1, padding: 0
          }}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
        placeholder={placeholder}
        style={{
          border: 'none', background: 'none', outline: 'none', flex: 1,
          minWidth: 120, color: 'var(--text-primary)', fontSize: 13
        }}
      />
      {input && (
        <button onClick={addTag} className="btn btn-primary btn-sm">Adicionar</button>
      )}
    </div>
  );
}

export default function Filters() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    axios.get('/api/config').then(r => setConfig(r.data)).catch(console.error);
  }, []);

  const update = (field, value) => setConfig(prev => ({ ...prev, [field]: value }));

  const togglePropertyType = (type) => {
    const types = config.propertyTypes || [];
    update('propertyTypes', types.includes(type)
      ? types.filter(t => t !== type)
      : [...types, type]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put('/api/config', config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div className="page fade-in"><div style={{ color: 'var(--text-muted)' }}>Carregando...</div></div>;

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Filtros de Busca</div>
          <div className="page-subtitle">Configure os critérios para coleta e exibição de imóveis</div>
        </div>
        <button
          id="btn-save-filters"
          className={`btn ${saved ? 'btn-success' : 'btn-primary'} btn-lg`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '⏳ Salvando...' : saved ? '✅ Salvo!' : '💾 Salvar Filtros'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Cidade */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>🏙️ Cidade de Busca</div>
          <div className="input-group">
            <label className="input-label">Cidade principal</label>
            <input
              id="filter-city"
              className="input"
              type="text"
              value={config.city || ''}
              onChange={e => update('city', e.target.value)}
              placeholder="Ex: Juiz de Fora"
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            💡 Apenas imóveis mencionando esta cidade serão coletados e exibidos
          </div>
        </div>

        {/* Tipo de Imóvel */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>🏠 Tipo de Imóvel</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              className={`btn ${!config.propertyTypes?.length ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => update('propertyTypes', [])}
            >
              Todos os tipos
            </button>
            {PROPERTY_TYPES.map(pt => (
              <button
                key={pt.value}
                className={`btn ${config.propertyTypes?.includes(pt.value) ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => togglePropertyType(pt.value)}
              >
                {pt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Faixa de Preço */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>💰 Faixa de Preço (R$)</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="input-group" style={{ flex: 1, minWidth: 180 }}>
              <label className="input-label">Preço mínimo</label>
              <input
                id="filter-price-min"
                className="input"
                type="number"
                value={config.priceMin || ''}
                onChange={e => update('priceMin', e.target.value ? Number(e.target.value) : null)}
                placeholder="Ex: 150000"
                min={0}
              />
            </div>
            <div className="input-group" style={{ flex: 1, minWidth: 180 }}>
              <label className="input-label">Preço máximo</label>
              <input
                id="filter-price-max"
                className="input"
                type="number"
                value={config.priceMax || ''}
                onChange={e => update('priceMax', e.target.value ? Number(e.target.value) : null)}
                placeholder="Ex: 800000"
                min={0}
              />
            </div>
          </div>
          {config.priceMin && config.priceMax && (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)' }}>
              Faixa: R$ {Number(config.priceMin).toLocaleString('pt-BR')} — R$ {Number(config.priceMax).toLocaleString('pt-BR')}
            </div>
          )}
        </div>

        {/* Quartos */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>🛏️ Mínimo de Quartos</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {BEDROOM_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                className={`btn ${config.bedroomsMin === opt.value ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => update('bedroomsMin', opt.value)}
                style={{ minWidth: 60 }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bairros */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>📍 Bairros de Interesse</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Digite um bairro e pressione Enter. Deixe vazio para todos os bairros.
          </div>
          <TagInput
            tags={config.neighborhoods || []}
            onChange={val => update('neighborhoods', val)}
            placeholder="Ex: Centro, São Mateus..."
          />
        </div>

        {/* Palavras-chave extras */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>🔑 Palavras-chave Extras</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Termos adicionais para filtrar os posts coletados. Ex: "piscina", "churrasqueira"
          </div>
          <TagInput
            tags={config.extraKeywords || []}
            onChange={val => update('extraKeywords', val)}
            placeholder="Ex: piscina, churrasqueira..."
          />
        </div>

        {/* Resumo */}
        <div className="card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-dim)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--accent)' }}>
            📋 Resumo dos Filtros Ativos
          </div>
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>🏙️ Cidade: <strong>{config.city || 'Todas'}</strong></div>
            <div>🏠 Tipos: <strong>{config.propertyTypes?.length ? config.propertyTypes.join(', ') : 'Todos'}</strong></div>
            <div>💰 Preço: <strong>
              {config.priceMin || config.priceMax
                ? `R$ ${(config.priceMin || 0).toLocaleString('pt-BR')} — R$ ${(config.priceMax || '∞').toLocaleString?.('pt-BR') ?? '∞'}`
                : 'Qualquer'}
            </strong></div>
            <div>🛏️ Quartos: <strong>{config.bedroomsMin ? `${config.bedroomsMin}+ quartos` : 'Qualquer'}</strong></div>
            <div>📍 Bairros: <strong>{config.neighborhoods?.length ? config.neighborhoods.join(', ') : 'Todos'}</strong></div>
            <div>🔑 Extras: <strong>{config.extraKeywords?.length ? config.extraKeywords.join(', ') : '—'}</strong></div>
          </div>
        </div>

      </div>
    </div>
  );
}
