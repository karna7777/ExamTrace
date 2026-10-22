// A single exam card used on the dashboard. In Examiner Mode it also shows
// Edit and Delete controls. The Start button is a placeholder until the exam
// engine lands in Phase 3.
import React from "react";

export default function ExamCard({ exam, isExaminer, onStart, onEdit, onDelete }) {
  return (
    <div className="exam-card">
      <div className="exam-card-top">
        <h3 className="exam-title">{exam.title}</h3>
        {exam.isSample && <span className="badge">Sample</span>}
      </div>
      {exam.subject && <p className="exam-subject">{exam.subject}</p>}
      {exam.description && <p className="exam-desc">{exam.description}</p>}

      <div className="exam-meta">
        <span>{exam.questionCount} questions</span>
        <span>•</span>
        <span>{exam.durationMinutes} min</span>
      </div>

      <div className="exam-actions">
        <button
          className="btn btn-primary"
          onClick={() => onStart && onStart(exam)}
          disabled={!onStart}
          title={onStart ? "Start examination" : "The exam engine arrives in Phase 3"}
        >
          Start Examination
        </button>
        {isExaminer && (
          <>
            <button className="btn btn-ghost" onClick={() => onEdit(exam)}>
              Edit
            </button>
            <button className="btn btn-danger" onClick={() => onDelete(exam)}>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
