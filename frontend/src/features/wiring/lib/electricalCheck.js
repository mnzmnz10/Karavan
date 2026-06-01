// Heuristic electrical analysis helpers for the BOM/check dialog.

const POS_NAMES = new Set([
  '+', 'V+', 'BAT+', 'IN+', 'OUT+', 'PV+', 'DC+', '30', '87',
  'POS', 'PLUS', 'B+',
]);
const NEG_NAMES = new Set([
  '-', 'V-', 'BAT-', 'IN-', 'OUT-', 'PV-', 'DC-', 'GND', '86',
  'NEG', 'MINUS', 'B-', 'ŞASE',
]);
const AC_L_NAMES = new Set(['AC L', 'AC IN L', 'AC OUT L', 'L']);
const AC_N_NAMES = new Set(['AC N', 'AC IN N', 'AC OUT N', 'N']);
const PE_NAMES = new Set(['PE']);
const SIGNAL_NAMES = new Set(['CAN', 'RS485', 'SIG', 'CTRL', 'A', 'B', '85', '86']);

export function portPolarity(name) {
  const n = (name || '').trim().toUpperCase();
  if (POS_NAMES.has(n)) return 'positive';
  if (NEG_NAMES.has(n)) return 'negative';
  if (AC_L_NAMES.has(n)) return 'ac_l';
  if (AC_N_NAMES.has(n)) return 'ac_n';
  if (PE_NAMES.has(n)) return 'pe';
  if (SIGNAL_NAMES.has(n)) return 'signal';
  if (n.endsWith('+')) return 'positive';
  if (n.endsWith('-')) return 'negative';
  return null;
}

const INCOMPATIBLE_PAIRS = [
  ['positive', 'negative'],
  ['positive', 'pe'],
  ['ac_l', 'ac_n'],
  ['ac_l', 'pe'],
  ['ac_l', 'negative'],
  ['ac_n', 'positive'],
];

export function checkWireSafety(wire, devices) {
  const fromDev = devices.find((d) => d.id === wire.from.deviceId);
  const toDev = devices.find((d) => d.id === wire.to.deviceId);
  if (!fromDev || !toDev) return null;
  const fp = fromDev.ports.find((p) => p.id === wire.from.portId);
  const tp = toDev.ports.find((p) => p.id === wire.to.portId);
  if (!fp || !tp) return null;
  const fpol = portPolarity(fp.name);
  const tpol = portPolarity(tp.name);
  if (!fpol || !tpol) return null;
  for (const [a, b] of INCOMPATIBLE_PAIRS) {
    if ((fpol === a && tpol === b) || (fpol === b && tpol === a)) {
      return {
        severity: 'warning',
        message: `${fromDev.name}.${fp.name} (${fpol}) → ${toDev.name}.${tp.name} (${tpol})`,
      };
    }
  }
  return null;
}

// ====== Net-level netlist (one node per electrical net) ======
// Returns an array of nets, each net is { id, ports: [...], dominantPolarity, suggestedName }
// A net is a connected component of the port-graph induced by wires.
export function computeNets(devices, wires) {
  const portKey = (deviceId, portId) => `${deviceId}:${portId}`;
  const adj = new Map();
  const portInfo = new Map(); // key -> { deviceId, portId, deviceName, portName, color, polarity }

  for (const d of devices) {
    for (const p of d.ports) {
      const k = portKey(d.id, p.id);
      adj.set(k, []);
      portInfo.set(k, {
        deviceId: d.id, portId: p.id,
        deviceName: d.name, portName: p.name,
        color: p.color, polarity: portPolarity(p.name),
      });
    }
  }
  for (const w of wires) {
    const a = portKey(w.from.deviceId, w.from.portId);
    const b = portKey(w.to.deviceId, w.to.portId);
    if (!adj.has(a) || !adj.has(b)) continue;
    adj.get(a).push({ key: b, wireId: w.id });
    adj.get(b).push({ key: a, wireId: w.id });
  }

  const visited = new Set();
  const nets = [];
  let netCounter = 1;
  for (const startKey of adj.keys()) {
    if (visited.has(startKey)) continue;
    if (adj.get(startKey).length === 0) continue; // skip unconnected ports
    const stack = [startKey];
    const ports = [];
    while (stack.length) {
      const cur = stack.pop();
      if (visited.has(cur)) continue;
      visited.add(cur);
      ports.push(portInfo.get(cur));
      for (const next of adj.get(cur) || []) {
        if (!visited.has(next.key)) stack.push(next.key);
      }
    }
    // Determine dominant polarity
    const polTally = {};
    for (const p of ports) if (p.polarity) polTally[p.polarity] = (polTally[p.polarity] || 0) + 1;
    let dominant = null, maxCount = 0;
    for (const [k, v] of Object.entries(polTally)) if (v > maxCount) { dominant = k; maxCount = v; }
    const suggestedName = dominant ? `NET_${dominant.toUpperCase()}_${netCounter}` : `NET_${netCounter}`;
    nets.push({
      id: `net_${netCounter}`,
      ports,
      dominantPolarity: dominant,
      suggestedName,
    });
    netCounter += 1;
  }
  return nets;
}

export function netlistToCsv(nets) {
  const rows = [['NetID', 'NetName', 'Device', 'Port', 'PortColor', 'Polarity']];
  for (const net of nets) {
    for (const p of net.ports) {
      rows.push([net.id, net.suggestedName, p.deviceName, p.portName, p.color, p.polarity || '']);
    }
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
