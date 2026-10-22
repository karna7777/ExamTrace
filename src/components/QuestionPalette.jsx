// The question palette: one numbered button per question, with clear visual
// states. "Answered" and "marked for review" are independent, so a question can
// be both. The current question is always highlighted.
import React from "react";

export default function QuestionPalette({ questions, answers, marked, currentIndex, onJump }) {
  function stateClass(q, index) {
    const classes = ["palette-btn"];
    if (index === currentIndex) classes.push("current");
    if (q.id in answers) classes.push("answered");
    if (marked.includes(q.id)) classes.push("marked");
    return classes.join(" ");
  }

  return (
    <div className="palette">
      <h3 className="palette-title">Questions</h3>
      <div className="palette-grid">
        {questions.map((q, index) => (
          <button key={q.id} className={stateClass(q, index)} onClick={() => onJump(index)}>
            {index + 1}
          </button>
        ))}
      </div>
      <div className="palette-legend">
        <span><i className="dot answered" /> Answered</span>
        <span><i className="dot marked" /> Marked</span>
        <span><i className="dot current" /> Current</span>
        <span><i className="dot" /> Not answered</span>
      </div>
    </div>
  );
}
