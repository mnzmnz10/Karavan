import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { DiagramCanvas } from "@/features/wiringrf/components/canvas/DiagramCanvas";
import { LibraryPanel } from "@/features/wiringrf/components/panels/LibraryPanel";
import { PropertiesPanel } from "@/features/wiringrf/components/panels/PropertiesPanel";
import { TopBar } from "@/features/wiringrf/components/panels/TopBar";
import { BottomPanel } from "@/features/wiringrf/components/panels/BottomPanel";
import { AiModal } from "@/features/wiringrf/components/panels/AiModal";
import { ToastHost } from "@/features/wiringrf/components/Toast";
import {
  hydrateFromStorage,
  useProjectStore,
} from "@/features/wiringrf/store/useProjectStore";
import { buildSeedProject } from "@/features/wiringrf/data/seed";

type WiringRfSectionProps = {
  fullscreen?: boolean;
};

export default function WiringRfSection({ fullscreen }: WiringRfSectionProps) {
  const [ai, setAi] = useState(false);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const deleteSelection = useProjectStore((s) => s.deleteSelection);

  useEffect(() => {
    hydrateFromStorage();
    const state = useProjectStore.getState();
    if (state.nodes.length === 0) {
      state.loadSnapshot(buildSeedProject(), {
        name: "Örnek Victron Sistemi",
        customer: "Demo",
        systemVoltage: "12V",
        vanType: "Panel Van",
      });
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        (key === "y" || (key === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelection();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelection]);

  const sizeCls = fullscreen ? "h-screen w-screen" : "h-full min-h-[720px] w-full";

  return (
    <ReactFlowProvider>
      <div className={`flex ${sizeCls} flex-col overflow-hidden bg-slate-100`}>
        <TopBar onAi={() => setAi(true)} />
        <div className="flex min-h-0 flex-1">
          <LibraryPanel />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <DiagramCanvas />
            </div>
            <BottomPanel />
          </div>
          <PropertiesPanel />
        </div>
        <AiModal open={ai} onClose={() => setAi(false)} />
        <ToastHost />
      </div>
    </ReactFlowProvider>
  );
}
