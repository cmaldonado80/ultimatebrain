'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type VIPLevel = 'Standard' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
type ComplaintStatus = 'open' | 'in-progress' | 'resolved';

interface GuestPreferences {
  roomTemp: string;
  pillowType: string;
  dietary: string;
  newspaper: string;
  floorPref: string;
  extraRequests: string;
}

interface StayRecord {
  ref: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  total: number;
  rating: number;
}

interface Complaint {
  id: string;
  date: string;
  subject: string;
  status: ComplaintStatus;
  assignedTo: string;
}

interface Guest {
  id: string;
  name: string;
  email: string;
  vipLevel: VIPLevel;
  totalStays: number;
  lifetimeSpend: number;
  lastVisit: string;
  loyaltyPoints: number;
  preferences: GuestPreferences;
  stayHistory: StayRecord[];
  complaints: Complaint[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const GUESTS: Guest[] = [
  {
    id: '1',
    name: 'James Whitfield',
    email: 'j.whitfield@meridian.com',
    vipLevel: 'Diamond',
    totalStays: 48,
    lifetimeSpend: 127400,
    lastVisit: '2026-03-10',
    loyaltyPoints: 84200,
    preferences: { roomTemp: '20°C', pillowType: 'Down Soft', dietary: 'No restrictions', newspaper: 'Financial Times', floorPref: 'High floor', extraRequests: 'Champagne on arrival, extra towels' },
    stayHistory: [
      { ref: 'MGH-2026-00312', checkIn: '2026-03-08', checkOut: '2026-03-10', roomType: 'Penthouse', total: 2800, rating: 5 },
      { ref: 'MGH-2026-00198', checkIn: '2026-01-14', checkOut: '2026-01-17', roomType: 'Suite', total: 3150, rating: 5 },
    ],
    complaints: [],
  },
  {
    id: '2',
    name: 'Amara Osei',
    email: 'amara.osei@globalventures.co',
    vipLevel: 'Platinum',
    totalStays: 22,
    lifetimeSpend: 54800,
    lastVisit: '2026-03-18',
    loyaltyPoints: 32100,
    preferences: { roomTemp: '22°C', pillowType: 'Memory Foam', dietary: 'Vegan', newspaper: 'The Guardian', floorPref: 'Mid floor', extraRequests: 'Plant-based welcome amenity' },
    stayHistory: [
      { ref: 'MGH-2026-00401', checkIn: '2026-03-16', checkOut: '2026-03-18', roomType: 'Suite', total: 1680, rating: 5 },
      { ref: 'MGH-2025-01204', checkIn: '2025-11-02', checkOut: '2025-11-05', roomType: 'Deluxe', total: 960, rating: 4 },
    ],
    complaints: [
      { id: 'C-001', date: '2025-11-04', subject: 'Air conditioning noise in room 412', status: 'resolved', assignedTo: 'Engineering' },
    ],
  },
  {
    id: '3',
    name: 'Claire Dubois',
    email: 'cdubois@luxepartners.fr',
    vipLevel: 'Gold',
    totalStays: 14,
    lifetimeSpend: 31200,
    lastVisit: '2026-02-27',
    loyaltyPoints: 18400,
    preferences: { roomTemp: '21°C', pillowType: 'Firm Latex', dietary: 'Gluten-Free', newspaper: 'Le Monde', floorPref: 'Any', extraRequests: 'Late checkout preferred' },
    stayHistory: [
      { ref: 'MGH-2026-00289', checkIn: '2026-02-25', checkOut: '2026-02-27', roomType: 'Deluxe', total: 840, rating: 4 },
    ],
    complaints: [],
  },
  {
    id: '4',
    name: 'Takeshi Nakamura',
    email: 't.nakamura@horizongroup.jp',
    vipLevel: 'Diamond',
    totalStays: 61,
    lifetimeSpend: 198600,
    lastVisit: '2026-03-20',
    loyaltyPoints: 142800,
    preferences: { roomTemp: '19°C', pillowType: 'Down Firm', dietary: 'Pescatarian', newspaper: 'Nikkei', floorPref: 'Top floor only', extraRequests: 'Yukata robe, green tea set, no feather duvet' },
    stayHistory: [
      { ref: 'MGH-2026-00438', checkIn: '2026-03-18', checkOut: '2026-03-20', roomType: 'Penthouse', total: 5200, rating: 5 },
      { ref: 'MGH-2026-00301', checkIn: '2026-03-01', checkOut: '2026-03-04', roomType: 'Suite', total: 4050, rating: 5 },
    ],
    complaints: [],
  },
  {
    id: '5',
    name: 'Sofia Marín',
    email: 'sofia.marin@privado.es',
    vipLevel: 'Silver',
    totalStays: 6,
    lifetimeSpend: 9400,
    lastVisit: '2026-01-30',
    loyaltyPoints: 4600,
    preferences: { roomTemp: '23°C', pillowType: 'Feather Light', dietary: 'Vegetarian', newspaper: 'El País', floorPref: 'Low floor', extraRequests: 'Extra blanket' },
    stayHistory: [
      { ref: 'MGH-2026-00142', checkIn: '2026-01-28', checkOut: '2026-01-30', roomType: 'Standard', total: 580, rating: 4 },
    ],
    complaints: [
      { id: 'C-002', date: '2026-01-29', subject: 'Room not ready at check-in time', status: 'resolved', assignedTo: 'Front Desk' },
    ],
  },
  {
    id: '6',
    name: 'Edward Hollis',
    email: 'edward.hollis@hollisinv.com',
    vipLevel: 'Platinum',
    totalStays: 31,
    lifetimeSpend: 78900,
    lastVisit: '2026-03-22',
    loyaltyPoints: 51200,
    preferences: { roomTemp: '20°C', pillowType: 'Down Medium', dietary: 'Halal', newspaper: 'The Times', floorPref: 'High floor, quiet side', extraRequests: 'No shellfish in amenity plate' },
    stayHistory: [
      { ref: 'MGH-2026-00447', checkIn: '2026-03-21', checkOut: '2026-03-22', roomType: 'Suite', total: 1400, rating: 4 },
    ],
    complaints: [
      { id: 'C-003', date: '2026-03-22', subject: 'Billing discrepancy on F&B charge', status: 'in-progress', assignedTo: 'Accounts' },
    ],
  },
  {
    id: '7',
    name: 'Priya Sharma',
    email: 'priya.sharma@techbridge.in',
    vipLevel: 'Gold',
    totalStays: 18,
    lifetimeSpend: 38700,
    lastVisit: '2026-03-19',
    loyaltyPoints: 22300,
    preferences: { roomTemp: '22°C', pillowType: 'Memory Foam', dietary: 'Vegetarian, no onion/garlic', newspaper: 'None', floorPref: 'Any', extraRequests: 'Yoga mat in room' },
    stayHistory: [
      { ref: 'MGH-2026-00421', checkIn: '2026-03-17', checkOut: '2026-03-19', roomType: 'Deluxe', total: 1080, rating: 5 },
    ],
    complaints: [],
  },
  {
    id: '8',
    name: 'Lucas Ferreira',
    email: 'lucas.f@brazilprop.br',
    vipLevel: 'Standard',
    totalStays: 2,
    lifetimeSpend: 1840,
    lastVisit: '2026-03-15',
    loyaltyPoints: 920,
    preferences: { roomTemp: '24°C', pillowType: 'Firm', dietary: 'No restrictions', newspaper: 'None', floorPref: 'Any', extraRequests: '' },
    stayHistory: [
      { ref: 'MGH-2026-00388', checkIn: '2026-03-13', checkOut: '2026-03-15', roomType: 'Standard', total: 560, rating: 3 },
    ],
    complaints: [
      { id: 'C-004', date: '2026-03-14', subject: 'Wi-Fi connectivity issues', status: 'open', assignedTo: 'IT Support' },
    ],
  },
];

const NPS_SCORE = 72;
const NPS_TREND = [68, 70, 69, 71, 73, 72, 72];
const NPS_DATES = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

// ─── Colour Maps ──────────────────────────────────────────────────────────────
const VIP_BADGE: Record<VIPLevel, { bg: string; color: string }> = {
  Standard: { bg: '#374151', color: '#9ca3af' },
  Silver:   { bg: '#1f2937', color: '#94a3b8' },
  Gold:     { bg: '#422006', color: '#fbbf24' },
  Platinum: { bg: '#1e3a5f', color: '#93c5fd' },
  Diamond:  { bg: '#2e1065', color: '#c4b5fd' },
};

const COMPLAINT_STATUS: Record<ComplaintStatus, { bg: string; color: string; label: string }> = {
  'open':        { bg: '#450a0a', color: '#f87171', label: 'Open' },
  'in-progress': { bg: '#431407', color: '#fb923c', label: 'In Progress' },
  'resolved':    { bg: '#052e16', color: '#4ade80', label: 'Resolved' },
};

// ─── Page Component ───────────────────────────────────────────────────────────
export default function GuestsPage() {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [vipFilter, setVipFilter] = useState<string>('all');

  const filtered = GUESTS.filter(g => {
    const q = search.toLowerCase();
    const matchSearch = !q || g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q);
    const matchVip = vipFilter === 'all' || g.vipLevel === vipFilter;
    return matchSearch && matchVip;
  });

  const activeComplaints = GUESTS.flatMap(g => g.complaints).filter(c => c.status !== 'resolved');

  const S = {
    page:    { minHeight: '100vh', background: '#0f172a', color: '#f9fafb', fontFamily: 'system-ui, sans-serif', padding: '24px' } as React.CSSProperties,
    h1:      { fontSize: '22px', fontWeight: 700, marginBottom: '4px' } as React.CSSProperties,
    sub:     { fontSize: '13px', color: '#6b7280', marginBottom: '28px' } as React.CSSProperties,
    row:     { display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' as const },
    input:   { background: '#1f2937', border: '1px solid #374151', color: '#f9fafb', padding: '9px 14px', borderRadius: '8px', fontSize: '14px', flex: 1, minWidth: '220px', outline: 'none' } as React.CSSProperties,
    select:  { background: '#1f2937', border: '1px solid #374151', color: '#f9fafb', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' } as React.CSSProperties,
    card:    { background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', marginBottom: '10px', overflow: 'hidden' } as React.CSSProperties,
    cardTop: { padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' } as React.CSSProperties,
    h2:      { fontSize: '15px', fontWeight: 600, color: '#e5e7eb', marginBottom: '14px', borderBottom: '1px solid #374151', paddingBottom: '8px' } as React.CSSProperties,
    section: { marginBottom: '28px' } as React.CSSProperties,
  };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Guest Experience</h1>
      <p style={S.sub}>Profiles, preferences and loyalty tracking for all MGHM guests</p>

      {/* NPS Banner */}
      <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '20px', marginBottom: '28px', display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>NPS Score</div>
          <div style={{ fontSize: '48px', fontWeight: 800, color: NPS_SCORE >= 70 ? '#4ade80' : NPS_SCORE >= 50 ? '#fbbf24' : '#f87171', lineHeight: 1.1 }}>{NPS_SCORE}</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Excellent · 30-day rolling avg</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>6-month trend</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '50px' }}>
            {NPS_TREND.map((score, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>{score}</div>
                <div style={{ width: '100%', height: `${(score / 100) * 40}px`, background: i === NPS_TREND.length - 1 ? '#4ade80' : '#374151', borderRadius: '2px' }} />
                <div style={{ fontSize: '9px', color: '#6b7280' }}>{NPS_DATES[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Complaints */}
      {activeComplaints.length > 0 && (
        <div style={S.section}>
          <h2 style={S.h2}>Active Complaints ({activeComplaints.length})</h2>
          {GUESTS.map(g =>
            g.complaints
              .filter(c => c.status !== 'resolved')
              .map(c => (
                <div key={c.id} style={{ background: c.status === 'open' ? '#1a0a0a' : '#1a0e07', border: `1px solid ${c.status === 'open' ? '#991b1b' : '#7c2d12'}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f9fafb' }}>{c.subject}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                      {g.name} · {c.date} · Assigned to {c.assignedTo}
                    </div>
                  </div>
                  <span style={{ background: COMPLAINT_STATUS[c.status].bg, color: COMPLAINT_STATUS[c.status].color, padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                    {COMPLAINT_STATUS[c.status].label}
                  </span>
                </div>
              ))
          )}
        </div>
      )}

      {/* Search & Filters */}
      <div style={S.row}>
        <input
          style={S.input}
          placeholder="Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={S.select} value={vipFilter} onChange={e => setVipFilter(e.target.value)}>
          <option value="all">All VIP Levels</option>
          {(['Diamond','Platinum','Gold','Silver','Standard'] as VIPLevel[]).map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>{filtered.length} guests</span>
      </div>

      {/* Guest Cards */}
      {filtered.map(guest => {
        const isExpanded = expandedId === guest.id;
        const vipStyle = VIP_BADGE[guest.vipLevel];
        return (
          <div key={guest.id} style={S.card}>
            <div style={S.cardTop} onClick={() => setExpandedId(isExpanded ? null : guest.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, color: '#e5e7eb', flexShrink: 0 }}>
                  {guest.name.charAt(0)}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '15px', color: '#f9fafb' }}>{guest.name}</span>
                    <span style={{ background: vipStyle.bg, color: vipStyle.color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                      {guest.vipLevel.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{guest.email}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Total Stays</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#a78bfa' }}>{guest.totalStays}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Lifetime Spend</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#34d399' }}>
                    ${guest.lifetimeSpend.toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Last Visit</div>
                  <div style={{ fontSize: '14px', color: '#e5e7eb' }}>{guest.lastVisit}</div>
                </div>
                <div style={{ color: '#6b7280', fontSize: '18px', userSelect: 'none' }}>{isExpanded ? '▲' : '▼'}</div>
              </div>
            </div>

            {isExpanded && (
              <div style={{ borderTop: '1px solid #374151', padding: '20px', background: '#111827' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flexWrap: 'wrap' }}>
                  {/* Preferences */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preferences</div>
                    {[
                      { label: 'Room Temp', val: guest.preferences.roomTemp },
                      { label: 'Pillow Type', val: guest.preferences.pillowType },
                      { label: 'Dietary', val: guest.preferences.dietary },
                      { label: 'Newspaper', val: guest.preferences.newspaper },
                      { label: 'Floor Pref', val: guest.preferences.floorPref },
                      { label: 'Special Requests', val: guest.preferences.extraRequests || 'None' },
                    ].map(p => (
                      <div key={p.label} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '13px' }}>
                        <span style={{ color: '#6b7280', minWidth: '120px', flexShrink: 0 }}>{p.label}:</span>
                        <span style={{ color: '#e5e7eb' }}>{p.val}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', padding: '8px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#6b7280' }}>Loyalty Points</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fbbf24' }}>{guest.loyaltyPoints.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  {/* Stay History */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stay History</div>
                    {guest.stayHistory.map(stay => (
                      <div key={stay.ref} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', padding: '10px 12px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', color: '#a78bfa', fontWeight: 600 }}>{stay.ref}</span>
                          <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>${stay.total.toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>{stay.checkIn} → {stay.checkOut} · {stay.roomType}</div>
                        <div style={{ fontSize: '12px', color: '#fbbf24', marginTop: '4px' }}>{'★'.repeat(stay.rating)}{'☆'.repeat(5 - stay.rating)}</div>
                      </div>
                    ))}

                    {/* All Complaints */}
                    {guest.complaints.length > 0 && (
                      <>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginTop: '14px', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Complaints</div>
                        {guest.complaints.map(c => (
                          <div key={c.id} style={{ background: '#1f2937', border: `1px solid #374151`, borderRadius: '6px', padding: '10px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '12px', color: '#e5e7eb', fontWeight: 500 }}>{c.subject}</div>
                              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{c.date} · {c.assignedTo}</div>
                            </div>
                            <span style={{ background: COMPLAINT_STATUS[c.status].bg, color: COMPLAINT_STATUS[c.status].color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
                              {COMPLAINT_STATUS[c.status].label}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
