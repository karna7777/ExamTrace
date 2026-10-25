// Sidebar navigation. Shows different items for Candidate Mode and Examiner
// Mode, plus the Examiner Mode unlock / Lock Examiner Mode action at the bottom.
import React from "react";

const CANDIDATE_NAV = ["Dashboard", "My History", "My Reports", "Connection", "Settings"];
const EXAMINER_NAV = ["Dashboard", "Create Exam", "Manage Exams", "History", "Analytics", "Connection", "Settings"];

export default function Sidebar({ isExaminer, active, onNavigate, onExaminerAction, teacherLoggedIn }) {
  let items = isExaminer ? EXAMINER_NAV : CANDIDATE_NAV;
  // When logged in to a teacher server, offer the Teacher Results screen.
  if (teacherLoggedIn && !items.includes("Teacher Results")) {
    items = [...items];
    items.splice(items.indexOf("Connection"), 0, "Teacher Results");
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">ET</span>
        <span className="brand-name">ExamTrace</span>
      </div>

      <nav className="nav">
        {items.map((item) => (
          <button
            key={item}
            className={"nav-item" + (active === item ? " active" : "")}
            onClick={() => onNavigate(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {isExaminer ? (
          <>
            <button className="examiner-btn active-mode" onClick={() => onExaminerAction("lock")}>
              Lock Examiner Mode
            </button>
            <p className="mode-note">Examiner Mode unlocked</p>
          </>
        ) : (
          <>
            <button className="examiner-btn" onClick={() => onExaminerAction("unlock")}>
              Examiner Mode
            </button>
            <p className="mode-note">Candidate Mode (default)</p>
          </>
        )}
      </div>
    </aside>
  );
}
