import React from "react";

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, { error: Error | null; info: React.ErrorInfo | null }> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ error, info });
    console.error("Unhandled error in React tree:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#0f1119",
          color: "#e5e7eb",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        }}>
          <h1 style={{ margin: 0, marginBottom: 12 }}>Something went wrong.</h1>
          <p style={{ margin: 0, marginBottom: 12, maxWidth: 800, textAlign: "center" }}>
            An error occurred while rendering the IDE. The error is shown below.
          </p>
          <pre style={{
            width: "100%",
            maxWidth: 960,
            background: "rgba(0,0,0,0.5)",
            padding: 16,
            borderRadius: 8,
            overflowX: "auto",
            whiteSpace: "pre-wrap"
          }}>
            {this.state.error?.stack || this.state.error?.message}
          </pre>
          {this.state.info && (
            <details style={{ marginTop: 12, color: "#9ca3af" }}>
              <summary>Component stack</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.info.componentStack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
