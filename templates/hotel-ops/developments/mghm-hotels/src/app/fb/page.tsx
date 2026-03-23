'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type Category = 'Produce' | 'Dairy' | 'Meat' | 'Beverages' | 'Dry Goods';
type StockStatus = 'ok' | 'low' | 'critical';

interface InventoryItem {
  id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  cost: number; // cost per unit in $
  parLevel: number;
  status: StockStatus;
}

interface MenuItem {
  name: string;
  revenue: number;
  unitsSold: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const INVENTORY: InventoryItem[] = [
  { id: '1',  name: 'Roma Tomatoes',        category: 'Produce',   quantity: 12,  unit: 'kg',    cost: 2.40,  parLevel: 20,  status: 'low' },
  { id: '2',  name: 'Baby Spinach',         category: 'Produce',   quantity: 5,   unit: 'kg',    cost: 4.80,  parLevel: 8,   status: 'low' },
  { id: '3',  name: 'Russet Potatoes',      category: 'Produce',   quantity: 35,  unit: 'kg',    cost: 0.90,  parLevel: 25,  status: 'ok' },
  { id: '4',  name: 'Mixed Herbs (Fresh)',  category: 'Produce',   quantity: 2,   unit: 'kg',    cost: 18.00, parLevel: 4,   status: 'critical' },
  { id: '5',  name: 'Whole Milk',           category: 'Dairy',     quantity: 40,  unit: 'L',     cost: 1.20,  parLevel: 30,  status: 'ok' },
  { id: '6',  name: 'Heavy Cream',          category: 'Dairy',     quantity: 6,   unit: 'L',     cost: 3.50,  parLevel: 10,  status: 'low' },
  { id: '7',  name: 'Gruyère Cheese',       category: 'Dairy',     quantity: 3,   unit: 'kg',    cost: 22.00, parLevel: 5,   status: 'low' },
  { id: '8',  name: 'Unsalted Butter',      category: 'Dairy',     quantity: 18,  unit: 'kg',    cost: 8.50,  parLevel: 15,  status: 'ok' },
  { id: '9',  name: 'Angus Beef Tenderloin',category: 'Meat',      quantity: 8,   unit: 'kg',    cost: 48.00, parLevel: 12,  status: 'low' },
  { id: '10', name: 'Free-Range Chicken',   category: 'Meat',      quantity: 22,  unit: 'kg',    cost: 12.00, parLevel: 20,  status: 'ok' },
  { id: '11', name: 'Atlantic Salmon',      category: 'Meat',      quantity: 1,   unit: 'kg',    cost: 32.00, parLevel: 8,   status: 'critical' },
  { id: '12', name: 'Sparkling Water (CS)', category: 'Beverages', quantity: 48,  unit: 'cases', cost: 14.00, parLevel: 30,  status: 'ok' },
  { id: '13', name: 'House Red Wine',       category: 'Beverages', quantity: 9,   unit: 'btls',  cost: 18.00, parLevel: 24,  status: 'critical' },
  { id: '14', name: 'Arabica Coffee Beans', category: 'Beverages', quantity: 7,   unit: 'kg',    cost: 24.00, parLevel: 10,  status: 'low' },
  { id: '15', name: 'Premium Orange Juice', category: 'Beverages', quantity: 22,  unit: 'L',     cost: 3.80,  parLevel: 20,  status: 'ok' },
  { id: '16', name: 'Arborio Rice',         category: 'Dry Goods', quantity: 14,  unit: 'kg',    cost: 4.20,  parLevel: 10,  status: 'ok' },
  { id: '17', name: 'All-Purpose Flour',    category: 'Dry Goods', quantity: 30,  unit: 'kg',    cost: 1.10,  parLevel: 25,  status: 'ok' },
  { id: '18', name: 'Panko Breadcrumbs',    category: 'Dry Goods', quantity: 3,   unit: 'kg',    cost: 5.60,  parLevel: 6,   status: 'low' },
];

const TOP_MENU_ITEMS: MenuItem[] = [
  { name: 'Pan-Seared Salmon',         revenue: 4280, unitsSold: 107 },
  { name: 'Angus Beef Tenderloin',     revenue: 3960, unitsSold: 66  },
  { name: 'Truffle Risotto',           revenue: 3150, unitsSold: 90  },
  { name: 'Full English Breakfast',    revenue: 2890, unitsSold: 165 },
  { name: 'Chicken Suprême',           revenue: 2640, unitsSold: 110 },
];

const COST_SUMMARY = {
  foodCostPct:    28.4,
  bevCostPct:     22.1,
  totalFBRevenue: 42650,
  wasteAmount:    1480,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<StockStatus, { bg: string; text: string }> = {
  ok:       { bg: '#052e16', text: '#4ade80' },
  low:      { bg: '#431407', text: '#fb923c' },
  critical: { bg: '#450a0a', text: '#f87171' },
};

const CAT_COLOR: Record<Category, string> = {
  Produce:   '#166534',
  Dairy:     '#1e40af',
  Meat:      '#7f1d1d',
  Beverages: '#4c1d95',
  'Dry Goods':'#374151',
};

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:    { minHeight: '100vh', background: '#0f172a', color: '#f9fafb', fontFamily: 'system-ui, sans-serif', padding: '24px' } as React.CSSProperties,
  h1:      { fontSize: '22px', fontWeight: 700, marginBottom: '4px' } as React.CSSProperties,
  sub:     { fontSize: '13px', color: '#6b7280', marginBottom: '28px' } as React.CSSProperties,
  section: { marginBottom: '32px' } as React.CSSProperties,
  h2:      { fontSize: '15px', fontWeight: 600, color: '#e5e7eb', marginBottom: '14px', borderBottom: '1px solid #374151', paddingBottom: '8px' } as React.CSSProperties,
  card:    { background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '20px' } as React.CSSProperties,
  table:   { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th:      { textAlign: 'left' as const, padding: '8px 12px', color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '1px solid #374151' },
  td:      { padding: '10px 12px', borderBottom: '1px solid #1f2937', color: '#e5e7eb' },
  badge:   (bg: string, text: string) => ({ background: bg, color: text, padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 } as React.CSSProperties),
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' } as React.CSSProperties,
  kpi:     { background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '16px 20px' } as React.CSSProperties,
  kpiLabel:{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  kpiVal:  { fontSize: '26px', fontWeight: 700, marginTop: '4px' } as React.CSSProperties,
  alert:   { background: '#450a0a', border: '1px solid #991b1b', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
};

// ─── Page Component ───────────────────────────────────────────────────────────
export default function FBPage() {
  const [catFilter, setCatFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = INVENTORY.filter(item => {
    if (catFilter !== 'all' && item.category !== catFilter) return false;
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    return true;
  });

  const alerts = INVENTORY.filter(i => i.status === 'low' || i.status === 'critical');

  return (
    <div style={S.page}>
      <h1 style={S.h1}>F&amp;B Operations</h1>
      <p style={S.sub}>Food &amp; Beverage inventory, cost controls and outlet performance</p>

      {/* Cost Summary KPIs */}
      <div style={S.kpiGrid}>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Food Cost %</div>
          <div style={{ ...S.kpiVal, color: COST_SUMMARY.foodCostPct > 30 ? '#f87171' : '#4ade80' }}>
            {COST_SUMMARY.foodCostPct}%
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Target: ≤30%</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Beverage Cost %</div>
          <div style={{ ...S.kpiVal, color: COST_SUMMARY.bevCostPct > 25 ? '#f87171' : '#4ade80' }}>
            {COST_SUMMARY.bevCostPct}%
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Target: ≤25%</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Total F&amp;B Revenue</div>
          <div style={{ ...S.kpiVal, color: '#a78bfa' }}>${fmt(COST_SUMMARY.totalFBRevenue)}</div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>This month</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Waste Amount</div>
          <div style={{ ...S.kpiVal, color: '#fb923c' }}>${fmt(COST_SUMMARY.wasteAmount)}</div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>3.5% of revenue</div>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {alerts.length > 0 && (
        <div style={S.section}>
          <h2 style={S.h2}>Low Stock Alerts ({alerts.length} items)</h2>
          {alerts.map(item => (
            <div key={item.id} style={S.alert}>
              <div>
                <span style={{ fontWeight: 600, color: '#fca5a5' }}>{item.name}</span>
                <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '10px' }}>{item.category}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: '#e5e7eb' }}>
                  {item.quantity} {item.unit} <span style={{ color: '#6b7280' }}>/ par {item.parLevel}</span>
                </span>
                <span style={S.badge(STATUS_COLOR[item.status].bg, STATUS_COLOR[item.status].text)}>
                  {item.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inventory Table */}
      <div style={S.section}>
        <h2 style={S.h2}>Inventory</h2>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <select
            style={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb', padding: '7px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
            value={catFilter} onChange={e => setCatFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {(['Produce','Dairy','Meat','Beverages','Dry Goods'] as Category[]).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            style={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb', padding: '7px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="ok">OK</option>
            <option value="low">Low</option>
            <option value="critical">Critical</option>
          </select>
          <span style={{ fontSize: '13px', color: '#6b7280', alignSelf: 'center' }}>
            {filtered.length} items
          </span>
        </div>

        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={S.table}>
            <thead>
              <tr style={{ background: '#111827' }}>
                <th style={S.th}>Item</th>
                <th style={S.th}>Category</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Qty</th>
                <th style={S.th}>Unit</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Cost/Unit</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Par Level</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} style={{ background: item.status === 'critical' ? '#1a0a0a' : item.status === 'low' ? '#1a0e07' : 'transparent' }}>
                  <td style={{ ...S.td, fontWeight: 500, color: '#f9fafb' }}>{item.name}</td>
                  <td style={S.td}>
                    <span style={{ background: CAT_COLOR[item.category], color: '#e5e7eb', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                      {item.category}
                    </span>
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', color: item.quantity < item.parLevel ? '#fb923c' : '#e5e7eb', fontWeight: 600 }}>
                    {item.quantity}
                  </td>
                  <td style={{ ...S.td, color: '#6b7280' }}>{item.unit}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>${item.cost.toFixed(2)}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#6b7280' }}>{item.parLevel}</td>
                  <td style={S.td}>
                    <span style={S.badge(STATUS_COLOR[item.status].bg, STATUS_COLOR[item.status].text)}>
                      {item.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Selling Items */}
      <div style={S.section}>
        <h2 style={S.h2}>Top 5 Menu Items — Month to Date</h2>
        <div style={S.card}>
          {TOP_MENU_ITEMS.map((item, idx) => {
            const maxRev = TOP_MENU_ITEMS[0].revenue;
            const pct = (item.revenue / maxRev) * 100;
            return (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: idx < TOP_MENU_ITEMS.length - 1 ? '14px' : 0 }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#9ca3af', flexShrink: 0 }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#f9fafb' }}>{item.name}</span>
                    <span style={{ fontSize: '13px', color: '#a78bfa', fontWeight: 600 }}>${fmt(item.revenue)}</span>
                  </div>
                  <div style={{ height: '6px', background: '#374151', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #7c3aed, #a78bfa)', borderRadius: '3px' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>{item.unitsSold} covers</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
