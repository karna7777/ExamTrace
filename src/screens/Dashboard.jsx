// Dashboard. Shows one unified list of available exams. Local exams are always
// present; when connected to a teacher server, published teacher exams are merged
// into the same list (they still carry their source internally so Start routes to
// the right engine). All stats come from real saved attempts.
import React, { useEffect, useState } from "react";
import ExamCard from "../components/ExamCard.jsx";
import { api } from "../api.js";

export default function Dashboard({ isExaminer, exams, onStart, onEdit, onDelete, onCreate }) {
  const [attempts, setAttempts] = useState([]);
  const [teacher, setTeacher] = useState({ state: "disconnected", list: [] });

  useEffect(() => {
    api.getExamHistory().then(setAttempts).catch(() => setAttempts([]));
    loadTeacherExams();
  }, []);

  async function loadTeacherExams() {
    const conn = await api.net.getConnection();
    if (!conn.serverUrl) {
      setTeacher({ state: "disconnected", list: [] });
      return;
    }
    const res = await api.net.getTeacherExams();
    if (res.ok) setTeacher({ state: "connected", list: res.data || [] });
    else setTeacher({ state: "unavailable", list: [] });
  }

  const total = attempts.length;
  const avg = total > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / total) : null;

  // Examiner manages local exams only here; candidates see local + teacher merged.
  const teacherCards = teacher.state === "connected" ? teacher.list.map((e) => ({ ...e, source: "teacher" })) : [];
  const combined = isExaminer ? exams : [...exams, ...teacherCards];

  return (
    <div>
      <div className="stat-row">
        <StatCard label={isExaminer ? "Total exams" : "Available exams"} value={combined.length} />
        <StatCard label="Attempts" value={total} />
        <StatCard label="Average score" value={avg === null ? "—" : avg + "%"} hint={total === 0 ? "No attempts yet" : null} />
      </div>

      <div className="section-head">
        <h2>{isExaminer ? "Your exams" : "Available examinations"}</h2>
        {isExaminer && (
          <button className="btn btn-primary" onClick={onCreate}>
            + Create Exam
          </button>
        )}
      </div>

      {combined.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No examinations yet</p>
          <p className="muted">
            {isExaminer ? "Create your first exam to get started." : "No exams are available right now."}
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {combined.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              isExaminer={isExaminer}
              onStart={onStart}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {!isExaminer && teacher.state === "unavailable" && (
        <p className="muted" style={{ marginTop: 12 }}>
          Teacher server unavailable — showing your local exams.
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
