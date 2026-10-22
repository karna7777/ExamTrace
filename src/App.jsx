// Top-level ExamTrace component (Phase 2).
//
// Decides which high-level screen to show based on examiner status from Main:
//   - recovery error (auth file missing but other data present)
//   - first-run examiner setup
//   - the main app (Candidate Mode by default, Examiner Mode when unlocked)
//
// Candidate Mode and Examiner Mode show different sidebars and screens. All
// authorization is enforced in Main; the UI only reflects the current state.

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

export default function App() {
  const [status, setStatus] = useState(null); // null while loading
  const [exams, setExams] = useState([]);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [editingExamId, setEditingExamId] = useState(null);
  const [showUnlock, setShowUnlock] = useState(false);

  async function refreshStatus() {
    const s = await api.getExaminerStatus();
    setStatus(s);
    return s;
  }

  async function loadExams() {
    const list = await api.getAvailableExams();
    setExams(list);
  }

  useEffect(() => {
    refreshStatus();
    loadExams();
  }, []);

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

  // ---- Examiner lock / unlock ----
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

  // ---- Exam management handlers ----
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
    if (result && result.ok) {
      await loadExams();
    }
  }
  async function afterSaved() {
    await loadExams();
    setEditingExamId(null);
    setActiveNav("Manage Exams");
  }

  // ---- Screen router ----
  function renderScreen() {
    switch (activeNav) {
      case "Dashboard":
        return (
          <Dashboard
            isExaminer={isExaminer}
            exams={exams}
            onEdit={startEdit}
            onDelete={handleDelete}
            onCreate={startCreate}
          />
        );
      case "Create Exam":
        return (
          <CreateExam
            examId={editingExamId}
            onSaved={afterSaved}
            onCancel={() => navigate("Manage Exams")}
          />
        );
      case "Manage Exams":
        return (
          <ManageExams
            exams={exams}
            onEdit={startEdit}
            onDelete={handleDelete}
            onCreate={startCreate}
          />
        );
      case "Settings":
        return <Settings isExaminer={isExaminer} />;
      case "History":
      case "My History":
        return <Placeholder title="History" phase="Phase 5" />;
      case "My Reports":
        return <Placeholder title="My Reports" phase="Phase 5" />;
      case "Analytics":
        return <Placeholder title="Analytics" phase="Phase 6" />;
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
