import React, { useState, useMemo } from 'react';

// Generic spreadsheet-style grid
export default function SheetGrid({ data, columns, onRowClick, actions, emptyMessage = 'No data.' }) {
  const [sortCol, setSortCol]   = useState(null);
  const [sortDir, setSortDir]   = useState('asc');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(0);
  const PAGE_SIZE = 50;

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let rows = [...data];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(row =>
        columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      rows.sort((a, b) => {
        const va = String(a[sortCol] ?? '');
        const vb = String(b[sortCol] ?? '');
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return rows;
  }, [data, search, sortCol, sortDir, columns]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="sheet-wrap">
      <div className="sheet-toolbar">
        <input
          placeholder="🔍 Search…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={{ padding:'5px 10px', border:'1.5px solid #d1d5db', borderRadius:6, fontSize:13, minWidth:200 }}
        />
        <span style={{ fontSize:12, color:'#6b7280', marginLeft:4 }}>{filtered.length} row{filtered.length!==1?'s':''}</span>
        {actions}
      </div>

      <div className="sheet-table-wrap">
        <table className="sheet-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)} style={{ minWidth: col.width || 100 }}>
                  {col.label}
                  {sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              {onRowClick && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={columns.length + 1} style={{ textAlign:'center', padding:'32px', color:'#9ca3af' }}>{emptyMessage}</td></tr>
            ) : paged.map((row, i) => (
              <tr key={i} style={{ cursor: onRowClick ? 'pointer' : 'default' }} onClick={() => onRowClick && onRowClick(row)}>
                {columns.map(col => (
                  <td key={col.key} title={String(row[col.key] ?? '')}>
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                  </td>
                ))}
                {onRowClick && <td><button className="admin-btn admin-btn-outline admin-btn-sm" onClick={e => { e.stopPropagation(); onRowClick(row); }}>Edit</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderTop:'1px solid #e5e7eb', fontSize:13, color:'#6b7280' }}>
          <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}>← Prev</button>
          <span>Page {page+1} of {totalPages}</span>
          <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page===totalPages-1}>Next →</button>
        </div>
      )}
    </div>
  );
}

// Badge renderers for the grid
export const StatusBadge = (status) => {
  const map = {
    Draft:'gray', Sent:'blue', Paid:'green', Overdue:'red', Void:'gray',
    Scheduled:'amber', 'In Progress':'green', Complete:'gray', Invoiced:'gray', Quoted:'blue',
    Active:'green', Inactive:'gray', TRUE:'green', FALSE:'gray',
    Initial:'blue', Revised:'amber', Converted:'green', Superseded:'gray', Approved:'green',
  };
  const color = map[status] || 'gray';
  return <span className={`admin-badge admin-badge-${color}`}>{status}</span>;
};

export const DivisionBadge = (div) => {
  if (div === 'Spray') return <span style={{ background:'#dcfce7', color:'#166534', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700 }}>Spray</span>;
  if (div === 'Tree')  return <span style={{ background:'#fef9c3', color:'#854d0e', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700 }}>Tree</span>;
  return <span style={{ color:'#6b7280' }}>{div}</span>;
};

export const CurrencyCell = (val) => {
  const n = parseFloat(val || 0);
  return <span style={{ fontWeight:600, color: n < 0 ? '#dc2626' : '#111827' }}>${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>;
};
