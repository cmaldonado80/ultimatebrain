'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type RoomStatus = 'available' | 'occupied' | 'maintenance' | 'checkout-today';
type RoomType = 'Standard' | 'Deluxe' | 'Suite' | 'Penthouse';

interface Room {
  number: string;
  floor: number;
  type: RoomType;
  status: RoomStatus;
  guestName?: string;
  checkoutDate?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const ROOM_TYPES: RoomType[] = ['Standard', 'Standard', 'Standard', 'Deluxe', 'Deluxe', 'Suite', 'Suite', 'Standard', 'Standard', 'Deluxe', 'Deluxe', 'Suite', 'Standard', 'Standard', 'Deluxe', 'Suite', 'Standard', 'Standard', 'Deluxe', 'Penthouse'];
const GUEST_NAMES = ['James Whitfield', 'Amara Osei', 'Claire Dubois', 'Takeshi Nakamura', 'Sofia Marín', 'Edward Hollis', 'Yuki Tanaka', 'Priya Sharma', 'Lucas Ferreira', 'Isabelle Moreau', 'Omar Al-Rashid', 'Hannah Beck'];
const STATUSES: RoomStatus[] = ['available', 'occupied', 'occupied', 'maintenance', 'checkout-today', 'occupied', 'available', 'occupied', 'available', 'checkout-today', 'occupied', 'available', 'maintenance', 'occupied', 'available', 'occupied', 'available', 'occupied', 'occupied', 'available'];

function generateRooms(): Room[] {
  const rooms: Room[] = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
  let guestIdx = 0;

  for (let floor = 1; floor <= 4; floor++) {
    for (let i = 1; i <= 20; i++) {
      const statusIdx = ((floor - 1) * 20 + i - 1) % STATUSES.length;
      const status = STATUSES[statusIdx];
      const room: Room = {
        number: `${floor}${String(i).padStart(2, '0')}`,
        floor,
        type: ROOM_TYPES[(i - 1) % ROOM_TYPES.length],
        status,
      };
      if (status === 'occupied') {
        room.guestName = GUEST_NAMES[guestIdx % GUEST_NAMES.length];
        room.checkoutDate = tomorrowStr;
        guestIdx++;
      }
      if (status === 'checkout-today') {
        room.guestName = GUEST_NAMES[guestIdx % GUEST_NAMES.length];
        room.checkoutDate = todayStr;
        guestIdx++;
      }
      rooms.push(room);
    }
  }
  return rooms;
}

const ALL_ROOMS = generateRooms();

// ─── Colour Map ───────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<RoomStatus, { bg: string; border: string; label: string }> = {
  available:        { bg: '#052e16', border: '#16a34a', label: 'Available' },
  occupied:         { bg: '#172554', border: '#3b82f6', label: 'Occupied' },
  maintenance:      { bg: '#450a0a', border: '#dc2626', label: 'Maintenance' },
  'checkout-today': { bg: '#431407', border: '#f97316', label: 'Checkout Today' },
};

const TYPE_BADGE: Record<RoomType, string> = {
  Standard:  '#374151',
  Deluxe:    '#1e3a5f',
  Suite:     '#3b1f6e',
  Penthouse: '#6b2d0f',
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:        { minHeight: '100vh', background: '#0f172a', color: '#f9fafb', fontFamily: 'system-ui, sans-serif', padding: '24px' } as React.CSSProperties,
  heading:     { fontSize: '22px', fontWeight: 700, marginBottom: '4px' } as React.CSSProperties,
  subheading:  { fontSize: '13px', color: '#6b7280', marginBottom: '24px' } as React.CSSProperties,
  statsBar:    { display: 'flex', gap: '12px', flexWrap: 'wrap' as const, marginBottom: '24px' },
  statCard:    { background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '12px 20px', minWidth: '110px' } as React.CSSProperties,
  statLabel:   { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  statValue:   { fontSize: '24px', fontWeight: 700, marginTop: '2px' } as React.CSSProperties,
  filters:     { display: 'flex', gap: '12px', flexWrap: 'wrap' as const, marginBottom: '24px' },
  select:      { background: '#1f2937', border: '1px solid #374151', color: '#f9fafb', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' } as React.CSSProperties,
  floorSection:{ marginBottom: '28px' } as React.CSSProperties,
  floorLabel:  { fontSize: '13px', fontWeight: 600, color: '#6b7280', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' } as React.CSSProperties,
  legend:      { display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '24px' },
  legendItem:  { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9ca3af' } as React.CSSProperties,
  legendDot:   (color: string) => ({ width: '10px', height: '10px', borderRadius: '2px', background: color } as React.CSSProperties),
};

function RoomCard({ room }: { room: Room }) {
  const { bg, border } = STATUS_COLORS[room.status];
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '8px', padding: '10px', cursor: 'default' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#f9fafb' }}>{room.number}</span>
        <span style={{ fontSize: '10px', background: TYPE_BADGE[room.type], color: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
          {room.type.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>{STATUS_COLORS[room.status].label}</div>
      {room.guestName && (
        <div style={{ fontSize: '11px', color: '#d1d5db', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.guestName}</div>
      )}
      {room.checkoutDate && (
        <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px' }}>
          CO: {room.checkoutDate}
        </div>
      )}
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function RoomsPage() {
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter]   = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = ALL_ROOMS.filter(r => {
    if (floorFilter !== 'all' && r.floor !== Number(floorFilter)) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  const counts = {
    total:      ALL_ROOMS.length,
    occupied:   ALL_ROOMS.filter(r => r.status === 'occupied').length,
    available:  ALL_ROOMS.filter(r => r.status === 'available').length,
    maintenance:ALL_ROOMS.filter(r => r.status === 'maintenance').length,
    arrivals:   12,
    departures: ALL_ROOMS.filter(r => r.status === 'checkout-today').length,
  };

  const floors = [1, 2, 3, 4].filter(f => floorFilter === 'all' || Number(floorFilter) === f);

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Room Management</h1>
      <p style={S.subheading}>Live floor-plan overview — updated every 5 minutes</p>

      {/* Stats Bar */}
      <div style={S.statsBar}>
        {[
          { label: 'Total Rooms', value: counts.total, color: '#f9fafb' },
          { label: 'Occupied',    value: counts.occupied,    color: '#3b82f6' },
          { label: 'Available',   value: counts.available,   color: '#16a34a' },
          { label: 'Maintenance', value: counts.maintenance, color: '#dc2626' },
          { label: "Today's Arrivals",   value: counts.arrivals,   color: '#a78bfa' },
          { label: "Today's Departures", value: counts.departures, color: '#f97316' },
        ].map(s => (
          <div key={s.label} style={S.statCard}>
            <div style={S.statLabel}>{s.label}</div>
            <div style={{ ...S.statValue, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={S.legend}>
        {Object.entries(STATUS_COLORS).map(([key, val]) => (
          <div key={key} style={S.legendItem}>
            <div style={S.legendDot(val.border)} />
            {val.label}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <select style={S.select} value={floorFilter} onChange={e => setFloorFilter(e.target.value)}>
          <option value="all">All Floors</option>
          {[1,2,3,4].map(f => <option key={f} value={f}>Floor {f}</option>)}
        </select>
        <select style={S.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {(['Standard','Deluxe','Suite','Penthouse'] as RoomType[]).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select style={S.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="available">Available</option>
          <option value="occupied">Occupied</option>
          <option value="maintenance">Maintenance</option>
          <option value="checkout-today">Checkout Today</option>
        </select>
        <span style={{ fontSize: '13px', color: '#6b7280', alignSelf: 'center' }}>
          Showing {filtered.length} of {ALL_ROOMS.length} rooms
        </span>
      </div>

      {/* Floor Grids */}
      {floors.map(floor => {
        const floorRooms = filtered.filter(r => r.floor === floor);
        if (floorRooms.length === 0) return null;
        return (
          <div key={floor} style={S.floorSection}>
            <div style={S.floorLabel}>Floor {floor}</div>
            <div style={S.grid}>
              {floorRooms.map(room => <RoomCard key={room.number} room={room} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
