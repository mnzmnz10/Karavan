import { canConnect } from "../rules";
import type { CurrentKind, Port, PortDirection, PortRole } from "../../types";

function port(
  role: PortRole,
  direction: PortDirection,
  kind: CurrentKind = "DC",
  id = `${role}_${direction}`,
): Port {
  return {
    id,
    name: id,
    role,
    direction,
    kind,
    side: "left",
    offset: 0.5,
  };
}

describe("canConnect", () => {
  it("allows out to in", () => {
    expect(canConnect(port("positive", "out"), port("positive", "in"), false).ok).toBe(true);
  });

  it("rejects out to out", () => {
    expect(canConnect(port("positive", "out"), port("positive", "out"), false).ok).toBe(false);
  });

  it("rejects in to in", () => {
    expect(canConnect(port("positive", "in"), port("positive", "in"), false).ok).toBe(false);
  });

  it("allows PV series panel minus to panel plus even when both ports are out", () => {
    expect(canConnect(port("pv_negative", "out"), port("pv_positive", "out"), false).ok).toBe(true);
  });

  it("rejects a second connection to an occupied single-input port", () => {
    const target = port("positive", "in", "DC", "battery_plus");
    expect(canConnect(port("positive", "out"), target, false, {
      targetNodeId: "battery",
      targetHandle: "battery_plus",
      existingEdges: [{ target: "battery", targetHandle: "battery_plus" }],
    }).ok).toBe(false);
  });

  it("rejects kind and polarity mismatches", () => {
    expect(canConnect(port("positive", "out", "DC"), port("positive", "in", "AC"), false).ok).toBe(false);
    expect(canConnect(port("positive", "out"), port("negative", "in"), false).ok).toBe(false);
  });
});
