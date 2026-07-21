import type { AppNode, AppEdge } from "@/features/wiringrf/store/useProjectStore";
import type { Port, ValidationWarning, CableType } from "@/features/wiringrf/types";
import { cableStrokeWidth } from "@/features/wiringrf/data/cables";
import { roleGroup, groupsCompatible, CABLE_ALLOWED_GROUPS } from "@/features/wiringrf/lib/rules";

// Deterministic warning ids (rule + node/edge) so React list keys are stable across renders.
function wid(rule: string, ref?: string): string {
  return ref ? `${rule}:${ref}` : rule;
}

function portOf(node: AppNode | undefined, handle?: string | null): Port | undefined {
  return node?.data.ports.find((p) => p.id === handle);
}

// Ampacity table (copper) mmÂ² -> A. Tuned for DC short-run battery cabling
// as used in caravan/Victron systems (higher than building-wiring tables).
const AMPACITY: Record<number, number> = {
  0.5: 9, 0.75: 12, 1: 20, 1.5: 25, 2.5: 35, 4: 50, 6: 70, 10: 100, 16: 135,
  25: 180, 35: 240, 50: 320, 70: 400, 95: 480, 120: 560,
};

function ampacity(size: string): number | undefined {
  const mm = parseFloat(size);
  // find nearest <= mm in table
  const keys = Object.keys(AMPACITY).map(Number).sort((a, b) => a - b);
  let best: number | undefined;
  for (const k of keys) if (k <= mm + 0.01) best = AMPACITY[k];
  return best;
}

function fuseAmp(fuse?: string): number | undefined {
  if (!fuse) return undefined;
  const m = parseFloat(fuse);
  return isNaN(m) ? undefined : m;
}

/**
 * Technical-check suggestions â€” NOT a regulatory guarantee.
 * Final sign-off must come from a qualified electrician.
 */
export function validate(nodes: AppNode[], edges: AppEdge[]): ValidationWarning[] {
  const out: ValidationWarning[] = [];
  const w = (severity: ValidationWarning["severity"], message: string, extra?: Partial<ValidationWarning>) =>
    out.push({ id: wid(message, extra?.edgeId ?? extra?.nodeId), severity, message, ...extra });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const e of edges) {
    const d = e.data!;
    const sn = nodeById.get(e.source);
    const tn = nodeById.get(e.target);
    const sp = portOf(sn, e.sourceHandle);
    const tp = portOf(tn, e.targetHandle);

    // Dangling reference: edge points at a missing node or port (silent mis-wire risk).
    if (!sn || !tn || (e.sourceHandle && !sp) || (e.targetHandle && !tp)) {
      w("error", `GeÃ§ersiz kablo: kaynak/hedef port bulunamadÄ± (${e.id}).`, { edgeId: e.id });
      continue;
    }

    // Explicit AC/DC kind mismatch (e.g. AC ground â†” DC ground), also for imported snapshots.
    if (sp && tp && sp.kind !== tp.kind) {
      w("error", `AkÄ±m tÃ¼rÃ¼ uyumsuz (${sp.kind} â†” ${tp.kind}): ${sn?.data.label} ${sp.name} â†’ ${tn?.data.label} ${tp.name}`, { edgeId: e.id });
    }

    // Role mismatch checks
    if (sp && tp) {
      const acRoles = ["phase", "neutral"];
      const dcRoles = ["positive", "negative"];
      const sAc = acRoles.includes(sp.role);
      const tDc = dcRoles.includes(tp.role);
      const sDc = dcRoles.includes(sp.role);
      const tAc = acRoles.includes(tp.role);
      if ((sAc && tDc) || (sDc && tAc)) {
        w("error", `AC/DC karÄ±ÅŸÄ±k baÄŸlantÄ±: ${sn?.data.label} ${sp.name} â†’ ${tn?.data.label} ${tp.name}`, { edgeId: e.id });
      }
      // phase to DC positive specifically
      if ((sp.role === "phase" && tp.role === "positive") || (sp.role === "positive" && tp.role === "phase")) {
        w("error", `DC + porta AC faz baÄŸlanmÄ±ÅŸ: ${sn?.data.label} â†’ ${tn?.data.label}`, { edgeId: e.id });
      }
      // neutral vs negative mix
      if ((sp.role === "neutral" && tp.role === "negative") || (sp.role === "negative" && tp.role === "neutral")) {
        w("warning", `AC nÃ¶tr ile DC negatif karÄ±ÅŸmÄ±ÅŸ olabilir: ${sn?.data.label} â†’ ${tn?.data.label}`, { edgeId: e.id });
      }

      // Polarity / role-group mismatch (catches snapshots that bypass the connect guard).
      const gs = roleGroup(sp.role);
      const gt = roleGroup(tp.role);
      const pvSeries =
        (sp.role === "pv_positive" && tp.role === "pv_negative") ||
        (sp.role === "pv_negative" && tp.role === "pv_positive");
      if (!groupsCompatible(gs, gt) && !pvSeries) {
        w("error", `Polarite/rol uyumsuz baÄŸlantÄ±: ${sn?.data.label} ${sp.name} (${gs}) â†’ ${tn?.data.label} ${tp.name} (${gt})`, { edgeId: e.id });
      }

      // Cable type vs the roles it actually connects.
      const allowed = CABLE_ALLOWED_GROUPS[d.cableType];
      if (allowed && !pvSeries && (!allowed.includes(gs) || !allowed.includes(gt))) {
        w("warning", `Kablo tipi (${d.cableType}) baÄŸlandÄ±ÄŸÄ± portlarla uyumsuz: ${sn?.data.label} ${sp.name} â†’ ${tn?.data.label} ${tp.name}`, { edgeId: e.id });
      }
    }

    // Cable vs fuse vs ampacity
    const cap = ampacity(d.size);
    const fa = fuseAmp(d.fuse);
    if (cap && fa && fa > cap) {
      w("error", `Sigorta (${d.fuse}) kablo kapasitesinden (${d.size} â‰ˆ ${cap}A) yÃ¼ksek: ${e.id}`, { edgeId: e.id });
    }
    // Inverter battery feed sizing
    if ((sn?.data.category === "inverter" || sn?.data.category === "inverter_charger" ||
         tn?.data.category === "inverter" || tn?.data.category === "inverter_charger") &&
        (d.cableType === "DC_POSITIVE" || d.cableType === "DC_NEGATIVE")) {
      const inv = sn?.data.category.startsWith("inverter") ? sn : tn;
      const reqA = inv?.data.voltage && inv.data.acdc ? estimateInverterCurrent(inv) : undefined;
      if (reqA && cap && cap < reqA) {
        w("warning", `Ä°nverter besleme kablosu ince olabilir: ${d.size} â‰ˆ ${cap}A < ~${Math.round(reqA)}A`, { edgeId: e.id });
      }
    }
  }

  // Battery positive must have a main fuse before distribution
  for (const n of nodes) {
    if (n.data.category === "battery") {
      const posPorts = n.data.ports.filter((p) => p.role === "positive").map((p) => p.id);
      const posEdges = edges.filter(
        (e) => (e.source === n.id && posPorts.includes(e.sourceHandle ?? "")) ||
               (e.target === n.id && posPorts.includes(e.targetHandle ?? "")),
      );
      const hasFuse = posEdges.some((e) => !!e.data?.fuse) ||
        posEdges.some((e) => {
          const other = nodeById.get(e.source === n.id ? e.target : e.source);
          return other?.data.category === "fuse" || other?.data.category === "lynx_distributor";
        });
      if (posEdges.length > 0 && !hasFuse) {
        w("warning", `AkÃ¼ "${n.data.label}" pozitif hattÄ±nda ana sigorta gÃ¶rÃ¼nmÃ¼yor.`, { nodeId: n.id });
      }
      if (posEdges.length === 0) {
        w("info", `AkÃ¼ "${n.data.label}" henÃ¼z baÄŸlanmamÄ±ÅŸ.`, { nodeId: n.id });
      }
    }

    // PE / ground presence for AC devices
    if (n.data.acdc === "AC") {
      const pePorts = n.data.ports.filter((p) => p.role === "ground").map((p) => p.id);
      if (pePorts.length > 0) {
        const peConnected = edges.some(
          (e) => (e.source === n.id && pePorts.includes(e.sourceHandle ?? "")) ||
                 (e.target === n.id && pePorts.includes(e.targetHandle ?? "")),
        );
        if (!peConnected) {
          w("warning", `AC cihaz "${n.data.label}" PE/toprak baÄŸlantÄ±sÄ± eksik.`, { nodeId: n.id });
        }
      }
    }

    // 230V consumer phase line must pass through RCD/MCB (phase-restricted path,
    // so a stray neutral/ground link to a breaker doesn't count as protection).
    if (n.data.category === "consumer_230v") {
      const protectedLine = phaseReachesProtection(n.id, nodes, edges);
      if (!protectedLine) {
        w("warning", `230V tÃ¼ketici "${n.data.label}" faz hattÄ±nda RCD/MCB gÃ¶rÃ¼nmÃ¼yor.`, { nodeId: n.id });
      }
    }
  }

  if (out.length === 0) {
    out.push({ id: "ok", severity: "info", message: "Belirgin sorun bulunamadÄ±. Yetkili elektrikÃ§i onayÄ± yine de gereklidir." });
  }
  return out;
}

function estimateInverterCurrent(inv: AppNode): number | undefined {
  const power = (inv.data as { power?: number }).power;
  const v = parseFloat(inv.data.voltage ?? "12");
  if (!power || !v) return undefined;
  return (power / v) * 1.2; // efficiency + headroom
}

// AC kaynak -> koruma -> tuketici sirasini yalnizca yonlu faz hattinda arar.
function phaseReachesProtection(consumerId: string, nodes: AppNode[], edges: AppEdge[]): boolean {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const isProtection = (id: string) => {
    const cat = nodeById.get(id)?.data.category;
    return cat === "rcd" || cat === "mcb";
  };
  const isAcSource = (n: AppNode) =>
    (n.data.category === "shore_power" || n.data.category === "inverter" || n.data.category === "inverter_charger") &&
    n.data.ports.some((p) => p.role === "phase" && p.direction === "out");

  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };

  for (const e of edges) {
    if (e.data?.cableType !== "AC_PHASE") continue;
    const sn = nodeById.get(e.source);
    const tn = nodeById.get(e.target);
    const sp = portOf(sn, e.sourceHandle);
    const tp = portOf(tn, e.targetHandle);
    if (sp?.role !== "phase" || tp?.role !== "phase") continue;
    link(e.source, e.target);
  }

  const sources = nodes.filter(isAcSource).map((n) => n.id);
  const seen = new Set<string>();
  const queue = sources.map((id) => ({ id, protectedLine: isProtection(id) }));
  for (const s of queue) seen.add(`${s.id}:${s.protectedLine}`);

  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur.id) ?? []) {
      const protectedLine = cur.protectedLine || isProtection(nb);
      if (nb === consumerId && protectedLine) return true;
      const key = `${nb}:${protectedLine}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ id: nb, protectedLine });
    }
  }
  return false;
}

export { cableStrokeWidth, type CableType };
