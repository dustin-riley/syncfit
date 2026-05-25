"use client";
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ChartCardBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <article
          className="ds-panel"
          style={{ padding: "var(--ds-space-3) var(--ds-space-4)" }}
        >
          <p className="ds-mono-note">couldn&apos;t render this chart.</p>
        </article>
      );
    }
    return this.props.children;
  }
}
