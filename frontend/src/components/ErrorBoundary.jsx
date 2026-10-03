import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[React ErrorBoundary caught error]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b1324",
            color: "#f8fafc",
            padding: "24px",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "600px",
              width: "100%",
              background: "#0f1c36",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "16px",
              padding: "32px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
                color: "#ef4444",
              }}
            >
              <AlertTriangle size={32} />
            </div>

            <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 8px" }}>
              Interface Render Exception Intercepted
            </h2>

            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 20px" }}>
              A UI component encountered an unexpected state. The application protected system state from corruption.
            </p>

            {this.state.error && (
              <pre
                style={{
                  background: "#070c18",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#f87171",
                  textAlign: "left",
                  overflowX: "auto",
                  margin: "0 0 24px",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {this.state.error.toString()}
              </pre>
            )}

            <button
              type="button"
              onClick={this.handleReset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={15} />
              <span>Reload Application Matrix</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
