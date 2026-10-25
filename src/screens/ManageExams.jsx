// Manage Exams (Examiner Mode). Lists all local exams with Edit and Delete.
// When logged in to a teacher server, each exam can also be Published / Closed.
import React, { useState } from "react";
import ExamCard from "../components/ExamCard.jsx";

export default function ManageExams({ exams, onEdit, onDelete, onCreate, teacherLoggedIn, onPublish, onClose, onPreview }) {
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function publish(exam) {
    setMessage(null);
    setError(null);
    setBusyId(exam.id);
    try {
      const res = await onPublish(exam);
      if (res && res.ok) setMessage('Published "' + exam.title + '" to students.');
      else setError((res && res.error) || "Publish failed.");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusyId(null);
    }
  }

  async function close(exam) {
    setMessage(null);
    setError(null);
    setBusyId(exam.id);
    try {
      const res = await onClose(exam);
      if (res && res.ok) setMessage('Closed "' + exam.title + '" (students can no longer start it).');
      else setError((res && res.error) || "Close failed.");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="section-head">
        <h2>Manage exams</h2>
        <button className="btn btn-primary" onClick={onCreate}>
          + Create Exam
        </button>
      </div>

      {!teacherLoggedIn && (
        <p className="muted" style={{ marginBottom: 12 }}>
          Tip: connect and log in as a teacher (Connection screen) to publish exams to students.
        </p>
      )}
      {message && <p className="status success">{message}</p>}
      {error && <p className="status error">{error}</p>}

      {exams.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No exams to manage</p>
          <p className="muted">Create an exam to see it listed here.</p>
        </div>
      ) : (
        <div className="card-grid">
          {exams.map((exam) => (
            <div key={exam.id} className="manage-card">
              <ExamCard exam={exam} isExaminer={true} onStart={null} onEdit={onEdit} onDelete={onDelete} />
              {teacherLoggedIn && (
                <div className="publish-row">
                  <button className="btn btn-primary btn-sm" onClick={() => publish(exam)} disabled={busyId === exam.id}>
                    {busyId === exam.id ? "Publishing..." : "Publish to students"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => close(exam)} disabled={busyId === exam.id}>
                    Close
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onPreview && onPreview(exam)}
                    disabled={busyId === exam.id}
                    title="Preview as a student (not recorded as an official result)"
                  >
                    Preview
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
