"use client";

import { Component, type ReactNode } from "react";

export interface MasterplanErrorBoundaryProps {
  onRetry: () => void;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/** Catches GLB loading / WebGL errors (R3F rethrows Canvas errors into the surrounding React tree). */
export class MasterplanErrorBoundary extends Component<MasterplanErrorBoundaryProps, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error("[masterplan] failed to render", error);
  }

  private retry = () => {
    this.setState({ failed: false });
    this.props.onRetry();
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        data-testid="masterplan-error"
        style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 16, color: "#0f172a" }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>No se pudo cargar el masterplan</p>
        <button
          type="button"
          data-testid="masterplan-retry"
          onClick={this.retry}
          style={{ minHeight: 44, padding: "0 20px", borderRadius: 8, border: "1px solid #0f172a", background: "#fff", color: "#0f172a", cursor: "pointer" }}
        >
          Reintentar
        </button>
      </div>
    );
  }
}
