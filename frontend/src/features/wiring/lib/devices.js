// Library of pre-defined caravan electrical devices.
// Each device has: id, name, category, icon (lucide name), width/height, ports[].
// Ports: { id, name, side: top|right|bottom|left, offset (0..1 along side), color }

import {
  Sun, Battery, Plug, Cable, Cpu, Zap, ToggleLeft, Lightbulb,
  Droplet, Flame, Refrigerator, Fan, Gauge, Power, ShieldAlert,
  Square, Activity, RadioTower, ArrowLeftRight, CircuitBoard, Anchor
} from 'lucide-react';

export const DEVICE_CATEGORIES = [
  { id: 'source', label: 'Kaynak' },
  { id: 'storage', label: 'Depolama' },
  { id: 'charger', label: 'Şarj / Dönüştürücü' },
  { id: 'protect', label: 'Koruma / Sigorta' },
  { id: 'bus', label: 'Bara / Bağlantı' },
  { id: 'control', label: 'Kontrol' },
  { id: 'load', label: 'Tüketici' },
  { id: 'sensor', label: 'Sensör / Gösterge' },
];

const p = (id, name, side, offset, color = '#F8F9FA') => ({ id, name, side, offset, color });

export const DEVICE_TEMPLATES = [
  {
    id: 'solar_panel', name: 'Güneş Paneli', category: 'source', icon: Sun,
    width: 140, height: 84, color: '#0A84FF',
    ports: [
      p('pv_plus', 'PV+', 'bottom', 0.35, '#FF3B30'),
      p('pv_minus', 'PV-', 'bottom', 0.65, '#1C1C1E'),
    ],
  },
  {
    id: 'battery', name: 'Akü', category: 'storage', icon: Battery,
    width: 120, height: 90, color: '#00FF66',
    ports: [
      p('plus', '+', 'top', 0.3, '#FF3B30'),
      p('minus', '-', 'top', 0.7, '#1C1C1E'),
    ],
  },
  {
    id: 'lifepo4', name: 'LiFePO4 Akü', category: 'storage', icon: Battery,
    width: 130, height: 90, color: '#00FF66',
    ports: [
      p('plus', '+', 'top', 0.3, '#FF3B30'),
      p('minus', '-', 'top', 0.7, '#1C1C1E'),
      p('bms_can', 'CAN', 'right', 0.5, '#FFD600'),
    ],
  },
  {
    id: 'dcdc', name: 'DC-DC Şarj', category: 'charger', icon: Cpu,
    width: 130, height: 96,
    ports: [
      p('in_plus', 'IN+', 'left', 0.3, '#FF3B30'),
      p('in_minus', 'IN-', 'left', 0.7, '#1C1C1E'),
      p('out_plus', 'OUT+', 'right', 0.3, '#FF3B30'),
      p('out_minus', 'OUT-', 'right', 0.7, '#1C1C1E'),
    ],
  },
  {
    id: 'ac_dc_charger', name: 'AC-DC Şarj', category: 'charger', icon: Plug,
    width: 140, height: 100,
    ports: [
      p('ac_l', 'AC L', 'left', 0.25, '#8B4513'),
      p('ac_n', 'AC N', 'left', 0.5, '#0A84FF'),
      p('ac_pe', 'PE', 'left', 0.75, '#FFCC00'),
      p('out_plus', '+', 'right', 0.3, '#FF3B30'),
      p('out_minus', '-', 'right', 0.7, '#1C1C1E'),
    ],
  },
  {
    id: 'mppt', name: 'MPPT', category: 'charger', icon: Activity,
    width: 130, height: 100,
    ports: [
      p('pv_plus', 'PV+', 'top', 0.35, '#FF3B30'),
      p('pv_minus', 'PV-', 'top', 0.65, '#1C1C1E'),
      p('bat_plus', 'BAT+', 'bottom', 0.35, '#FF3B30'),
      p('bat_minus', 'BAT-', 'bottom', 0.65, '#1C1C1E'),
    ],
  },
  {
    id: 'inverter', name: 'İnverter', category: 'charger', icon: Power,
    width: 150, height: 100,
    ports: [
      p('dc_plus', 'DC+', 'left', 0.3, '#FF3B30'),
      p('dc_minus', 'DC-', 'left', 0.7, '#1C1C1E'),
      p('ac_l', 'AC L', 'right', 0.3, '#8B4513'),
      p('ac_n', 'AC N', 'right', 0.7, '#0A84FF'),
    ],
  },
  {
    id: 'inverter_charger', name: 'İnverter/Şarj', category: 'charger', icon: Zap,
    width: 160, height: 110,
    ports: [
      p('dc_plus', 'DC+', 'left', 0.25, '#FF3B30'),
      p('dc_minus', 'DC-', 'left', 0.75, '#1C1C1E'),
      p('ac_in_l', 'AC IN L', 'top', 0.25, '#8B4513'),
      p('ac_in_n', 'AC IN N', 'top', 0.5, '#0A84FF'),
      p('ac_out_l', 'AC OUT L', 'right', 0.3, '#8B4513'),
      p('ac_out_n', 'AC OUT N', 'right', 0.7, '#0A84FF'),
    ],
  },
  {
    id: 'transfer_switch', name: 'Transfer Switch', category: 'charger', icon: ArrowLeftRight,
    width: 130, height: 100,
    ports: [
      p('in1_l', 'IN1 L', 'left', 0.25, '#8B4513'),
      p('in1_n', 'IN1 N', 'left', 0.5, '#0A84FF'),
      p('in2_l', 'IN2 L', 'left', 0.75, '#8B4513'),
      p('out_l', 'OUT L', 'right', 0.35, '#8B4513'),
      p('out_n', 'OUT N', 'right', 0.65, '#0A84FF'),
    ],
  },
  {
    id: 'positive_bus', name: 'Pozitif Bara', category: 'bus', icon: CircuitBoard,
    width: 160, height: 50, color: '#FF3B30',
    ports: [
      p('p1', '1', 'top', 0.15, '#FF3B30'),
      p('p2', '2', 'top', 0.35, '#FF3B30'),
      p('p3', '3', 'top', 0.55, '#FF3B30'),
      p('p4', '4', 'top', 0.75, '#FF3B30'),
      p('p5', '5', 'bottom', 0.5, '#FF3B30'),
    ],
  },
  {
    id: 'negative_bus', name: 'Negatif Bara', category: 'bus', icon: CircuitBoard,
    width: 160, height: 50, color: '#1C1C1E',
    ports: [
      p('n1', '1', 'top', 0.15, '#1C1C1E'),
      p('n2', '2', 'top', 0.35, '#1C1C1E'),
      p('n3', '3', 'top', 0.55, '#1C1C1E'),
      p('n4', '4', 'top', 0.75, '#1C1C1E'),
      p('n5', '5', 'bottom', 0.5, '#1C1C1E'),
    ],
  },
  {
    id: 'fuse_box', name: 'Sigorta Kutusu', category: 'protect', icon: ShieldAlert,
    width: 160, height: 90,
    ports: [
      p('in', 'IN+', 'left', 0.5, '#FF3B30'),
      p('o1', 'F1', 'right', 0.2, '#FF3B30'),
      p('o2', 'F2', 'right', 0.4, '#FF3B30'),
      p('o3', 'F3', 'right', 0.6, '#FF3B30'),
      p('o4', 'F4', 'right', 0.8, '#FF3B30'),
    ],
  },
  {
    id: 'mega_fuse', name: 'MEGA Fuse', category: 'protect', icon: ShieldAlert,
    width: 100, height: 60,
    ports: [
      p('a', 'A', 'left', 0.5, '#FF3B30'),
      p('b', 'B', 'right', 0.5, '#FF3B30'),
    ],
  },
  {
    id: 'midi_fuse', name: 'MIDI Fuse', category: 'protect', icon: ShieldAlert,
    width: 90, height: 50,
    ports: [
      p('a', 'A', 'left', 0.5, '#FF3B30'),
      p('b', 'B', 'right', 0.5, '#FF3B30'),
    ],
  },
  {
    id: 'anl_fuse', name: 'ANL Fuse', category: 'protect', icon: ShieldAlert,
    width: 100, height: 50,
    ports: [
      p('a', 'A', 'left', 0.5, '#FF3B30'),
      p('b', 'B', 'right', 0.5, '#FF3B30'),
    ],
  },
  {
    id: 'breaker', name: 'Otomatik Sigorta', category: 'protect', icon: ShieldAlert,
    width: 90, height: 60,
    ports: [
      p('a', 'A', 'top', 0.5, '#FF3B30'),
      p('b', 'B', 'bottom', 0.5, '#FF3B30'),
    ],
  },
  {
    id: 'fuse_box_12v', name: '12V Sigorta Kutusu', category: 'protect', icon: ShieldAlert,
    width: 160, height: 90,
    ports: [
      p('in', 'IN', 'left', 0.5, '#FF3B30'),
      p('o1', '1', 'right', 0.15, '#FF3B30'),
      p('o2', '2', 'right', 0.32, '#FF3B30'),
      p('o3', '3', 'right', 0.5, '#FF3B30'),
      p('o4', '4', 'right', 0.68, '#FF3B30'),
      p('o5', '5', 'right', 0.85, '#FF3B30'),
    ],
  },
  {
    id: 'relay', name: 'Röle', category: 'control', icon: ToggleLeft,
    width: 100, height: 80,
    ports: [
      p('coil_plus', '85', 'top', 0.3, '#FFD600'),
      p('coil_minus', '86', 'top', 0.7, '#1C1C1E'),
      p('common', '30', 'bottom', 0.25, '#FF3B30'),
      p('no', '87', 'bottom', 0.55, '#FF3B30'),
      p('nc', '87a', 'bottom', 0.85, '#FF3B30'),
    ],
  },
  {
    id: 'switch', name: 'Şalter', category: 'control', icon: ToggleLeft,
    width: 90, height: 70,
    ports: [
      p('a', 'A', 'left', 0.5, '#FF3B30'),
      p('b', 'B', 'right', 0.5, '#FF3B30'),
    ],
  },
  {
    id: 'rcd', name: 'Kaçak Akım Rölesi', category: 'protect', icon: ShieldAlert,
    width: 130, height: 90,
    ports: [
      p('in_l', 'IN L', 'top', 0.3, '#8B4513'),
      p('in_n', 'IN N', 'top', 0.7, '#0A84FF'),
      p('out_l', 'OUT L', 'bottom', 0.3, '#8B4513'),
      p('out_n', 'OUT N', 'bottom', 0.7, '#0A84FF'),
    ],
  },
  {
    id: 'ac_fuse', name: 'AC Sigorta', category: 'protect', icon: ShieldAlert,
    width: 90, height: 60,
    ports: [
      p('a', 'A', 'top', 0.5, '#8B4513'),
      p('b', 'B', 'bottom', 0.5, '#8B4513'),
    ],
  },
  {
    id: 'outlet', name: 'Priz', category: 'load', icon: Plug,
    width: 90, height: 70,
    ports: [
      p('l', 'L', 'left', 0.3, '#8B4513'),
      p('n', 'N', 'left', 0.5, '#0A84FF'),
      p('pe', 'PE', 'left', 0.7, '#FFCC00'),
    ],
  },
  {
    id: 'light', name: 'Aydınlatma', category: 'load', icon: Lightbulb,
    width: 90, height: 70,
    ports: [
      p('plus', '+', 'left', 0.35, '#FF3B30'),
      p('minus', '-', 'left', 0.65, '#1C1C1E'),
    ],
  },
  {
    id: 'pump', name: 'Su Pompası', category: 'load', icon: Droplet,
    width: 110, height: 70,
    ports: [
      p('plus', '+', 'left', 0.35, '#FF3B30'),
      p('minus', '-', 'left', 0.65, '#1C1C1E'),
    ],
  },
  {
    id: 'webasto', name: 'Webasto / Dizel Isıtıcı', category: 'load', icon: Flame,
    width: 140, height: 90,
    ports: [
      p('plus', '+', 'left', 0.25, '#FF3B30'),
      p('minus', '-', 'left', 0.5, '#1C1C1E'),
      p('ctrl', 'CTRL', 'left', 0.75, '#FFD600'),
    ],
  },
  {
    id: 'fridge', name: 'Buzdolabı', category: 'load', icon: Refrigerator,
    width: 130, height: 110,
    ports: [
      p('plus', '+', 'left', 0.3, '#FF3B30'),
      p('minus', '-', 'left', 0.7, '#1C1C1E'),
    ],
  },
  {
    id: 'fan', name: 'Fan', category: 'load', icon: Fan,
    width: 90, height: 70,
    ports: [
      p('plus', '+', 'left', 0.35, '#FF3B30'),
      p('minus', '-', 'left', 0.65, '#1C1C1E'),
    ],
  },
  {
    id: 'tank_level', name: 'Seviye Göstergesi', category: 'sensor', icon: Gauge,
    width: 110, height: 70,
    ports: [
      p('plus', '+', 'left', 0.25, '#FF3B30'),
      p('minus', '-', 'left', 0.5, '#1C1C1E'),
      p('sig', 'SIG', 'left', 0.75, '#FFD600'),
    ],
  },
  {
    id: 'float', name: 'Şamandıra', category: 'sensor', icon: Droplet,
    width: 90, height: 60,
    ports: [
      p('a', 'A', 'right', 0.4, '#FFD600'),
      p('b', 'B', 'right', 0.7, '#1C1C1E'),
    ],
  },
  {
    id: 'control_panel', name: 'Kontrol Paneli', category: 'control', icon: RadioTower,
    width: 150, height: 100,
    ports: [
      p('plus', '+', 'bottom', 0.2, '#FF3B30'),
      p('minus', '-', 'bottom', 0.4, '#1C1C1E'),
      p('rs485_a', 'A', 'bottom', 0.6, '#FFD600'),
      p('rs485_b', 'B', 'bottom', 0.8, '#FFD600'),
    ],
  },
  {
    id: 'ground', name: 'Topraklama', category: 'bus', icon: Anchor,
    width: 80, height: 60,
    ports: [
      p('g', 'GND', 'top', 0.5, '#FFCC00'),
    ],
  },
  {
    id: 'chassis', name: 'Şase Bağlantısı', category: 'bus', icon: Anchor,
    width: 90, height: 60,
    ports: [
      p('c', 'ŞASE', 'top', 0.5, '#1C1C1E'),
    ],
  },
];

export function getDeviceTemplate(id) {
  return DEVICE_TEMPLATES.find(d => d.id === id);
}
