/**
 * Exportação de dados da tabela de imóveis
 * Suporta: .xlsx  |  .docx  |  .txt
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// Colunas e seus rótulos em português
const COLUMNS = [
  { key: 'author_name',      label: 'Anunciante' },
  { key: 'city',             label: 'Cidade' },
  { key: 'neighborhood',     label: 'Bairro' },
  { key: 'property_type',    label: 'Tipo' },
  { key: 'transaction_type', label: 'Operação' },
  { key: 'price',            label: 'Preço (R$)' },
  { key: 'bedrooms',         label: 'Quartos' },
  { key: 'bathrooms',        label: 'Banheiros' },
  { key: 'garage',           label: 'Garagem' },
  { key: 'area_m2',          label: 'Área (m²)' },
  { key: 'phone',            label: 'Telefone' },
  { key: 'creci',            label: 'CRECI' },
  { key: 'post_url',         label: 'Link do Post' },
  { key: 'scraped_at',       label: 'Coletado em' },
];

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'price' || key === 'area_m2') {
    return typeof value === 'number' ? value.toLocaleString('pt-BR') : value;
  }
  if (key === 'scraped_at') {
    return new Date(value).toLocaleString('pt-BR');
  }
  if (key === 'property_type') {
    const map = { casa: 'Casa', apartamento: 'Apartamento', terreno: 'Terreno',
                  lote: 'Lote', sala: 'Sala Comercial', galpão: 'Galpão', outro: 'Outro' };
    return map[value] || value;
  }
  if (key === 'transaction_type') {
    const map = { venda: 'Venda', aluguel: 'Aluguel', temporada: 'Temporada' };
    return map[value] || value;
  }
  return String(value);
}

// ─── Excel (.xlsx) ────────────────────────────────────────────────────────────
export function exportXLSX(rows, filename = 'imoveis') {
  const header = COLUMNS.map(c => c.label);
  const data = rows.map(row =>
    COLUMNS.map(({ key }) => {
      const raw = row[key];
      if (key === 'price' || key === 'area_m2') return raw ? Number(raw) : null;
      return formatValue(key, raw);
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  // Largura das colunas
  ws['!cols'] = [
    { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 10 },
    { wch: 14 }, { wch: 8  }, { wch: 10 }, { wch: 8  }, { wch: 10 },
    { wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 20 },
  ];

  // Estilo do cabeçalho (negrito)
  header.forEach((_, i) => {
    const cell = XLSX.utils.encode_cell({ r: 0, c: i });
    if (!ws[cell]) return;
    ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: '2563EB' } }, alignment: { horizontal: 'center' } };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Imóveis');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${filename}.xlsx`);
}

// ─── Word (.docx) — gerado via HTML salvo como .doc ──────────────────────────
export function exportDOC(rows, filename = 'imoveis') {
  const dateStr = new Date().toLocaleString('pt-BR');

  const tableRows = rows.map(row => {
    const cells = COLUMNS.map(({ key, label }) =>
      `<tr>
        <td style="background:#f1f5f9;font-weight:600;padding:5px 10px;width:140px;border:1px solid #cbd5e1;">${label}</td>
        <td style="padding:5px 10px;border:1px solid #cbd5e1;">${formatValue(key, row[key])}</td>
      </tr>`
    ).join('');

    return `
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-family:Arial,sans-serif;font-size:12pt;">
        <tr><td colspan="2" style="background:#2563eb;color:white;padding:8px 10px;font-weight:bold;font-size:13pt;">
          🏠 ${row.author_name || 'Anunciante'} — ${row.city || ''}/${row.neighborhood || ''}
        </td></tr>
        ${cells}
      </table>
      <br/>`;
  }).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8">
      <title>Extrator de Imóveis</title>
      <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
      <style>
        body { font-family: Arial, sans-serif; font-size: 11pt; margin: 2cm; }
        h1 { color: #2563eb; font-size: 18pt; margin-bottom: 4px; }
        .meta { color: #64748b; font-size: 10pt; margin-bottom: 24px; }
      </style>
    </head>
    <body>
      <h1>🏠 Extrator de Imóveis — Relatório</h1>
      <p class="meta">Gerado em ${dateStr} &nbsp;|&nbsp; Total: ${rows.length} imóveis</p>
      ${tableRows}
    </body></html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  saveAs(blob, `${filename}.doc`);
}

// ─── Texto (.txt) ─────────────────────────────────────────────────────────────
export function exportTXT(rows, filename = 'imoveis') {
  const sep = '─'.repeat(60);
  const dateStr = new Date().toLocaleString('pt-BR');

  const lines = [
    '╔' + '═'.repeat(58) + '╗',
    '║  🏠  EXTRATOR DE IMÓVEIS — RELATÓRIO' + ' '.repeat(20) + '║',
    `║  Gerado em: ${dateStr}` + ' '.repeat(Math.max(0, 44 - dateStr.length)) + '║',
    `║  Total de imóveis: ${rows.length}` + ' '.repeat(Math.max(0, 38 - String(rows.length).length)) + '║',
    '╚' + '═'.repeat(58) + '╝',
    '',
  ];

  rows.forEach((row, i) => {
    lines.push(`${sep}`);
    lines.push(`  IMÓVEL #${i + 1}`);
    lines.push(sep);
    COLUMNS.forEach(({ key, label }) => {
      const val = formatValue(key, row[key]);
      if (val !== '—') {
        lines.push(`  ${label.padEnd(18)}: ${val}`);
      }
    });
    lines.push('');
  });

  lines.push(sep);
  lines.push(`  Fim do relatório — ${rows.length} imóveis exportados`);
  lines.push(sep);

  const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, `${filename}.txt`);
}
