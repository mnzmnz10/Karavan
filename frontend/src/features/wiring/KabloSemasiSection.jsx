import React, { useRef, useEffect } from 'react';
import DeviceLibrary from '@/features/wiring/components/DeviceLibrary';
import PropertiesPanel from '@/features/wiring/components/PropertiesPanel';
import Toolbar from '@/features/wiring/components/Toolbar';
import Canvas from '@/features/wiring/components/Canvas';
import { useEditorStore } from '@/features/wiring/store/editorStore';
import '@/features/wiring/wiring.css';

// kablosemasi Editor.jsx'ten türetildi: react-router'sız, Karavan sekmesi içinde
// tam ekran yerine sekme yüksekliğinde (h-[85vh]) çalışan bölüm bileşeni.
export default function KabloSemasiSection({ fullscreen = false }) {
  const canvasRef = useRef(null);

  // Veri kaybı önleme: editörde cihaz varken sayfa kapatma/yenileme öncesi uyar.
  useEffect(() => {
    const handler = (e) => {
      const devices = useEditorStore.getState().devices;
      if (devices && devices.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  // fullscreen: tarayıcı tam ekran (sidebar/döviz gizli) → editör tüm alanı kaplar.
  // değilse: normal kutu (döviz barı/sidebar görünür, çakışma olmaz).
  const sizeCls = fullscreen
    ? '-m-8 h-screen w-[calc(100%+4rem)]'
    : 'h-[85vh] w-full rounded-2xl border border-slate-200 shadow-sm';
  return (
    <div className={`wiring-root ${sizeCls} flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden`}>
      <Toolbar canvasSvgRef={canvasRef} />
      <div className="flex-1 flex overflow-hidden">
        <DeviceLibrary />
        <main className="flex-1 relative" data-testid="editor-canvas-wrapper">
          <Canvas ref={canvasRef} />
        </main>
        <PropertiesPanel />
      </div>
    </div>
  );
}
