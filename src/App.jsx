// Top-level ExamTrace component (Phase 3).
//
// Adds the examination flow on top of the Phase 2 shell:
//   - Pre-exam screen (candidate name + monitoring disclosure)
//   - Full-screen exam workspace (sidebar hidden)
//   - Result screen
// Plus renderer-reload recovery: on mount we ask Main whether an exam is
// already in progress and, if so, go straight back into the workspace.

import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Sidebar from "./components/Sidebar.jsx";
import ExaminerUnlockModal from "./components/ExaminerUnlockModal.jsx";
import ExaminerSetup from "./screens/ExaminerSetup.jsx";
import RecoveryError from "./screens/RecoveryError.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import CreateExam from "./screens/CreateExam.jsx";
import ManageExams from "./screens/ManageExams.jsx";
import Settings from "./screens/Settings.jsx";
import Placeholder from "./screens/Placeholder.jsx";
import PreExam from "./screens/PreExam.jsx";
import ExamWorkspace from "./screens/ExamWorkspace.jsx";
import ExamResult from "./screens/ExamResult.jsx";
import History from "./screens/History.jsx";
import Analytics from "./screens/Analytics.jsx";

// Apply the chosen theme. "system" removes the attribute so the OS setting (via
// a CSS media query) decides; "light"/"dark" force it.
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [exams, setExams] = useState([]);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [editingExamId, setEditingExamId] = useState(null);
  const [showUnlock, setShowUnlock] = useState(false);
  // examFlow.view: "none" | "preexam" | "workspace" | "result"
  const [examFlow, setExamFlow] = useState({ view: "none", exam: null, result: null });
  const [settings, setSettings] = useState(null);

  async function refreshStatus() {
    const s = await api.getExaminerStatus();
    setStatus(s);
    return s;
  }
  async function loadExams() {
    const list = await api.getAvailableExams();
    setExams(list);
  }
  async function loadSettings() {
    const st = await api.getSettings();
    setSettings(st);
    applyTheme(st.theme);
    return st;
  }

  // Re-apply the theme whenever settings change.
  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings]);

  useEffect(() => {
    async function boot() {
      // Recovery: if Main has an exam in progress (reload or relaunch), restore
      // the workspace. Otherwise, if startup recovery finalized an attempt whose
      // deadline passed while the app was closed, show that result.
      const active = await api.getActiveExam();
      if (active) {
        setExamFlow({ view: "workspace", exam: null, result: null });
      } else {
        const recovered = await api.getRecoveredResult();
        if (recovered) setExamFlow({ view: "result", exam: null, result: recovered });
      }
      await loadSettings();
      await refreshStatus();
      await loadExams();
    }
    boot();
  }, []);

  // ---- Full-screen exam flow takes priority over everything ----
  if (examFlow.view === "preexam") {
    return (
      <PreExam
        exam={examFlow.exam}
        settings={settings}
        onStarted={() => setExamFlow({ view: "workspace", exam: null, result: null })}
        onCancel={() => setExamFlow({ view: "none", exam: null, result: null })}
      />
    );
  }
  if (examFlow.view === "workspace") {
    return (
      <ExamWorkspace
        onFinish={(result) => {
          if (result) setExamFlow({ view: "result", exam: null, result });
          else {
            setExamFlow({ view: "none", exam: null, result: null });
            loadExams();
          }
        }}
      />
    );
  }
  if (examFlow.view === "result") {
    return (
      <ExamResult
        result={examFlow.result}
        onDone={() => {
          setExamFlow({ view: "none", exam: null, result: null });
          loadExams();
        }}
      />
    );
  }

  // ---- Loading / special screens ----
  if (status === null) {
    return <div className="centered-screen muted">Loading ExamTrace...</div>;
  }
  if (status.recovery) {
    return <RecoveryError />;
  }
  if (!status.configured) {
    return (
      <ExaminerSetup
        onComplete={async () => {
          await refreshStatus();
          await loadExams();
        }}
      />
    );
  }

  const isExaminer = status.unlocked;

  async function handleExaminerAction(action) {
    if (action === "unlock") {
      setShowUnlock(true);
    } else if (action === "lock") {
      await api.lockExaminer();
      await refreshStatus();
      setActiveNav("Dashboard");
      setEditingExamId(null);
    }
  }

  function navigate(item) {
    setEditingExamId(null);
    setActiveNav(item);
  }

  function startCreate() {
    setEditingExamId(null);
    setActiveNav("Create Exam");
  }
  function startEdit(exam) {
    setEditingExamId(exam.id);
    setActiveNav("Create Exam");
  }
  async function handleDelete(exam) {
    const result = await api.deleteExam(exam.id);
    if (result && result.ok) await loadExams();
  }
  async function afterSaved() {
    await loadExams();
    setEditingExamId(null);
    setActiveNav("Manage Exams");
  }
  function startExamFlow(exam) {
    setExamFlow({ view: "preexam", exam, result: null });
  }

  function renderScreen() {
    switch (activeNav) {
      case "Dashboard":
        return (
          <Dashboard
            isExaminer={isExaminer}
            exams={exams}
            onStart={isExaminer ? null : startExamFlow}
            onEdit={startEdit}
            onDelete={handleDelete}
            onCreate={startCreate}
          />
        );
      case "Create Exam":
        return (
          <CreateExam examId={editingExamId} onSaved={afterSaved} onCancel={() => navigate("Manage Exams")} />
        );
      case "Manage Exams":
        return <ManageExams exams={exams} onEdit={startEdit} onDelete={handleDelete} onCreate={startCreate} />;
      case "Settings":
        return (
          <Settings
            isExaminer={isExaminer}
            settings={settings}
            onSettingsChanged={(updated) => setSettings(updated)}
          />
        );
      case "History":
      case "My History":
      case "My Reports":
        return <History />;
      case "Analytics":
        return <Analytics />;
      default:
        return <Placeholder title={activeNav} phase="a later phase" />;
    }
  }

  const headerTitle =
    activeNav === "Create Exam" ? (editingExamId ? "Edit Exam" : "Create Exam") : activeNav;

  return (
    <div className="app-shell">
      <Sidebar
        isExaminer={isExaminer}
        active={activeNav}
        onNavigate={navigate}
        onExaminerAction={handleExaminerAction}
      />
      <main className="workspace">
        <header className="workspace-header">
          <h1>{headerTitle}</h1>
          <span className="phase-tag">{isExaminer ? "Examiner Mode" : "Candidate Mode"}</span>
        </header>
        {renderScreen()}
      </main>

      {showUnlock && (
        <ExaminerUnlockModal
          onClose={() => setShowUnlock(false)}
          onUnlocked={async () => {
            setShowUnlock(false);
            await refreshStatus();
            setActiveNav("Dashboard");
          }}
        />
      )}
    </div>
  );
}
