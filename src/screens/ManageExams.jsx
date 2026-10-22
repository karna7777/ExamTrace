// Manage Exams (Examiner Mode). Lists all exams with Edit and Delete actions.
import React from "react";
import ExamCard from "../components/ExamCard.jsx";

export default function ManageExams({ exams, onEdit, onDelete, onCreate }) {
  return (
    <div>
      <div className="section-head">
        <h2>Manage exams</h2>
        <button className="btn btn-primary" onClick={onCreate}>
          + Create Exam
        </button>
      </div>

      {exams.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No exams to manage</p>
          <p className="muted">Create an exam to see it listed here.</p>
        </div>
      ) : (
        <div className="card-grid">
          {exams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              isExaminer={true}
              onStart={null}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
