import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import axios from 'axios';

// Registra módulos do AG Grid v35+
ModuleRegistry.registerModules([AllCommunityModule]);
import { useWS } from '../context/WSContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportXLSX, exportDOC, exportTXT } from '../utils/export.js';

// ─── Cell Renderers ────────────────────────────────────────────────────────────

const PriceCell = ({ value }) => {
  if (!value) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <span style={{ color: 'var(--success)', fontWeight: 600 }}>
      R$ {parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
    </span>
  );
};

const BadgeCell = ({ value, colorMap }) => {
  if (!value) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const color = colorMap?.[value] || 'var(--accent)';
  return (
    <span style={{
      background: `${color}22`, color, padding: '2px 10px',
      borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'capitalize'
    }}>
      {value}
    </span>
  );
};

const PROP_COLORS = {
  apartamento: '#3b82f6', casa: '#10b981', terreno: '#f59e0b',
  galpão: '#8b5cf6', sala: '#06b6d4', kitnet: '#ec4899',
};

const TRANS_COLORS = {
  venda: '#10b981', aluguel: '#f59e0b', temporada: '#3b82f6',
};

const DateCell = ({ value }) => {
  if (!value) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
      {format(new Date(value), "dd/MM/yy HH:mm", { locale: ptBR })}
    </span>
  );
};

const PhoneCell = ({ value }) => {
  if (!value) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const d = value.replace(/\D/g, '').replace(/^55/, '');
  const fmt = d.length === 11
    ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
    : d.length === 10
    ? `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
    : value;
  return (
    <a href={`https://wa.me/${value}`} target="_blank" rel="noopener"
      style={{ color: '#25D366', fontWeight: 500, textDecoration: 'none' }}
      title="Abrir no WhatsApp">
      📱 {fmt}
    </a>
  );
};

const ContentCell = ({ value }) => {
  if (!value) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <span title={value} style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
      {value.length > 100 ? value.substring(0, 100) + '…' : value}
    </span>
  );
};

// ─── Column Definitions ────────────────────────────────────────────────────────

const COL_DEFS = [
  { field: 'created_at', headerName: 'Data Post', width: 130, cellRenderer: DateCell, sort: 'desc' },
  { field: 'author_name', headerName: 'Autor', width: 150 },
  { field: 'property_type', headerName: 'Tipo', width: 120,
    cellRenderer: (p) => <BadgeCell value={p.value} colorMap={PROP_COLORS} /> },
  { field: 'transaction_type', headerName: 'Negócio', width: 110,
    cellRenderer: (p) => <BadgeCell value={p.value} colorMap={TRANS_COLORS} /> },
  { field: 'price', headerName: 'Preço', width: 140, cellRenderer: PriceCell },
  { field: 'city', headerName: 'Cidade', width: 130 },
  { field: 'neighborhood', headerName: 'Bairro', width: 140 },
  { field: 'bedrooms', headerName: 'Quartos', width: 90,
    cellRenderer: ({ value }) => value ? `🛏 ${value}` : '—' },
  { field: 'area_m2', headerName: 'Área m²', width: 90,
    cellRenderer: ({ value }) => value ? `${parseFloat(value).toFixed(0)}m²` : '—' },
  { field: 'phone', headerName: 'Telefone', width: 160, cellRenderer: PhoneCell },
  { field: 'creci', headerName: 'CRECI', width: 110 },
  { field: 'content', headerName: 'Descrição', flex: 1, minWidth: 200, cellRenderer: ContentCell },
  { field: 'scraped_at', headerName: 'Coletado em', width: 130, cellRenderer: DateCell },
  {
    headerName: 'Link', width: 80, pinned: 'right',
    cellRenderer: ({ data }) => data.post_url
      ? <a href={data.post_url} target="_blank" rel="noopener"
          style={{ color: 'var(--accent)', fontSize: 13 }}>Ver 🔗</a>
      : '—',
  },
];

// ─── Export Dropdown ───────────────────────────────────────────────────────────

function ExportMenu({ rows }) {
  const [open, setOpen] = useState(false);
  const ts = format(new Date(), 'yyyyMMdd_HHmm');
  const name = `imoveis_${ts}`;

  const options = [
    { label: '📊 Excel (.xlsx)', action: () => exportXLSX(rows, name) },
    { label: '📝 Word (.doc)',   action: () => exportDOC(rows, name)  },
    { label: '📄 Texto (.txt)', action: () => exportTXT(rows, name)  },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button
        id="export-btn"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen(o => !o)}
        title="Exportar tabela"
      >
        ⬇️ Exportar <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <>
          {/* Overlay para fechar */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', top: '110%', right: 0, zIndex: 100,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-card)',
            minWidth: 180, overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 14px 6px', fontSize: 11, fontWeight: 600,
              color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
              borderBottom: '1px solid var(--border)' }}>
              {rows.length.toLocaleString('pt-BR')} registros
            </div>
            {options.map(({ label, action }) => (
              <button
                key={label}
                onClick={() => { action(); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '11px 16px', border: 'none', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Posts() {
  const gridRef = useRef();
  const [rowData, setRowData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    city: '', property_type: '', transaction_type: '',
    min_price: '', max_price: '', search: '',
  });
  const { subscribe } = useWS();

  const loadPosts = useCallback(async (extraFilters = {}) => {
    setLoading(true);
    try {
      const params = { limit: 1000, ...filters, ...extraFilters };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const res = await axios.get('/api/posts', { params });
      setRowData(res.data.data);
      setTotal(res.data.pagination.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadPosts(); }, []);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === 'new_post') {
        setRowData((prev) => [msg.post, ...prev]);
        setTotal((t) => t + 1);
      }
    });
    return unsub;
  }, [subscribe]);

  const defaultColDef = useMemo(() => ({
    sortable: true, filter: true, resizable: true,
    suppressHeaderMenuButton: false,
  }), []);

  return (
    <div className="page fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Imóveis Coletados</div>
          <div className="page-subtitle">{total.toLocaleString('pt-BR')} registros encontrados</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ExportMenu rows={rowData} />
          <button className="btn btn-primary btn-sm" onClick={() => loadPosts()}>
            🔄 Atualizar
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <input
          className="input"
          placeholder="🔍 Buscar no texto..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && loadPosts()}
          style={{ width: 220 }}
        />
        <input
          className="input"
          placeholder="Cidade"
          value={filters.city}
          onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
          style={{ width: 150 }}
        />
        <select className="filter-select" value={filters.property_type}
          onChange={(e) => { setFilters((f) => ({ ...f, property_type: e.target.value })); }}>
          <option value="">Tipo</option>
          <option value="apartamento">Apartamento</option>
          <option value="casa">Casa</option>
          <option value="terreno">Terreno</option>
          <option value="galpão">Galpão</option>
          <option value="sala">Sala</option>
          <option value="kitnet">Kitnet</option>
        </select>
        <select className="filter-select" value={filters.transaction_type}
          onChange={(e) => { setFilters((f) => ({ ...f, transaction_type: e.target.value })); }}>
          <option value="">Negócio</option>
          <option value="venda">Venda</option>
          <option value="aluguel">Aluguel</option>
          <option value="temporada">Temporada</option>
        </select>
        <input
          className="input" placeholder="Preço mín." type="number"
          value={filters.min_price}
          onChange={(e) => setFilters((f) => ({ ...f, min_price: e.target.value }))}
          style={{ width: 120 }}
        />
        <input
          className="input" placeholder="Preço máx." type="number"
          value={filters.max_price}
          onChange={(e) => setFilters((f) => ({ ...f, max_price: e.target.value }))}
          style={{ width: 120 }}
        />
        <button className="btn btn-primary btn-sm" onClick={() => loadPosts()}>Filtrar</button>
        <button className="btn btn-secondary btn-sm" onClick={() => {
          const empty = { city:'', property_type:'', transaction_type:'', min_price:'', max_price:'', search:'' };
          setFilters(empty);
          setTimeout(() => loadPosts(empty), 0);
        }}>Limpar</button>
      </div>

      {/* AG Grid */}
      <div className="ag-theme-custom" style={{ flex: 1, minHeight: 400 }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={COL_DEFS}
          defaultColDef={defaultColDef}
          animateRows
          pagination
          paginationPageSize={50}
          rowSelection="multiple"
          enableRangeSelection
          suppressCellFocus={false}
          loading={loading}
          loadingOverlayComponent={() => (
            <div style={{ color: 'var(--text-muted)', padding: 40 }}>Carregando imóveis...</div>
          )}
          noRowsOverlayComponent={() => (
            <div style={{ color: 'var(--text-muted)', padding: 40 }}>
              Nenhum imóvel encontrado. Adicione grupos e inicie a coleta.
            </div>
          )}
        />
      </div>
    </div>
  );
}
