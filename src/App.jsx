// Top-level ExamTrace component.
//
// Phase 1 only builds the application "shell": a sidebar with branding and
// placeholder navigation, a mode indicator, and a small panel that proves the
// secure IPC bridge to the Electron Main process works (ping + app info).
//
// Real screens (Dashboard, Exam Creator, Workspace, etc.) and real examiner
// authentication are added in later phases.

import React, { useEffect, useState } from "react";
import { api } from "./api.js";

// Candidate Mode is the default whenever the app launches.
const CANDIDATE_NAV = ["Dashboard", "My History", "My Reports", "Settings"];

export default function App() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [pingResult, setPingResult] = useState("(not called yet)");
  const [appInfo, setAppInfo] = useState(null);
  const [ipcError, setIpcError] = useState(null);

  // On mount, exercise the IPC bridge so we can visually confirm that the
  // Renderer can talk to the Main process.
  useEffect(() => {
    async function checkBridge() {
      try {
        const pong = await api.ping();
        setPingResult(pong);
        const info = await api.getAppInfo();
        setAppInfo(info);
      } catch (error) {
        setIpcError(String(error));
      }
    }
    checkBridge();
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">ET</span>
          <span className="brand-name">ExamTrace</span>
        </div>

        <nav className="nav">
          {CANDIDATE_NAV.map((item) => (
            <button
              key={item}
              className={"nav-item" + (activeNav === item ? " active" : "")}
              onClick={() => setActiveNav(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="examiner-btn" disabled title="Examiner authentication arrives in Phase 2">
            Examiner Mode
          </button>
          <p className="mode-note">Candidate Mode (default)</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <h1>{activeNav}</h1>
          <span className="phase-tag">Phase 1 - Foundation</span>
        </header>

        <section className="panel">
          <h2>Welcome to ExamTrace</h2>
          <p className="muted">
            Smart Desktop Examination &amp; Activity Monitoring System. This is the
            application shell. Examinations, monitoring and examiner tools are added in
            the next phases.
          </p>
        </section>

        <section className="panel">
          <h2>IPC Bridge Check</h2>
          <p className="muted">
            Proves the React renderer can talk to the Electron Main process through the
            secure preload bridge.
          </p>

          {ipcError ? (
            <p className="status error">IPC error: {ipcError}</p>
          ) : (
            <ul className="info-list">
              <li>
                <span className="label">ping() returned</span>
                <span className="value">{pingResult}</span>
              </li>
              <li>
                <span className="label">Product name</span>
                <span className="value">{appInfo ? appInfo.productName : "..."}</span>
              </li>
              <li>
                <span className="label">Version</span>
                <span className="value">{appInfo ? appInfo.version : "..."}</span>
              </li>
              <li>
                <span className="label">Platform</span>
                <span className="value">{appInfo ? appInfo.platform : "..."}</span>
              </li>
              <li>
                <span className="label">User data path</span>
                <span className="value mono">{appInfo ? appInfo.userDataPath : "..."}</span>
              </li>
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
