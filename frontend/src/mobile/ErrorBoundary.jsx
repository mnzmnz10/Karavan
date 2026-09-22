import React from "react";
import { AlertTriangle } from "lucide-react";

// Bir ekran render sırasında hata verirse tüm app beyaz ekrana düşmesin.
export default class ErrorBoundary extends React.Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    console.error("[mobile] ekran hatası:", err, info);
  }
  reset = () => this.setState({ err: null });
  render() {
    if (this.state.err) {
      return (
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <AlertTriangle className="mb-3 h-12 w-12 text-amber-400" strokeWidth={1.5} />
          <div className="text-[16px] font-semibold" style={{ color: "var(--m-ink)" }}>Bir sorun oluştu</div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--m-ink-2)" }}>Bu ekran yüklenemedi.</div>
          <button onClick={this.reset} className="m-press mt-4 rounded-2xl px-5 py-2.5 text-[15px] font-bold text-white" style={{ background: "var(--m-primary)" }}>
            Tekrar Dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
