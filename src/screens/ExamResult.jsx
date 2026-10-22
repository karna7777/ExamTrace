// Examination result + answer review. Shown after submission (manual or auto).
// All numbers are calculated in Main; correct answers are only revealed here,
// after finalization.
import React from "react";
import { formatTime } from "../api.js";

export default function ExamResult({ result, onDone }) {
  if (!result) {
    return (
      <div className="centered-screen muted">
        No result to show. <button className="btn btn-ghost" onClick={onDone}>Back</button>
      </div>
    );
  }

  const optionLetter = (i) => String.fromCharCode(65 + i); // 0 -> A

  return (
    <div className="result-screen">
      <div className="result-inner">
        <header className="result-header">
          <div>
            <h1>{result.title}</h1>
            <p className="muted">
              {result.candidateName} •{" "}
              {result.submissionType === "auto" ? "Auto-submitted (time expired)" : "Submitted"}
            </p>
          </div>
          <div className="result-score-badge">
            <span className="big">{result.percentage}%</span>
            <span className="muted">{result.score} / {result.totalQuestions}</span>
          </div>
        </header>

        <div className="stat-row">
          <Stat label="Correct" value={result.correct} />
          <Stat label="Incorrect" value={result.incorrect} />
          <Stat label="Unanswered" value={result.unanswered} />
          <Stat label="Time used" value={formatTime(result.timeUsedMs)} />
        </div>

        <h2 className="section-title">Answer review</h2>
        <div className="review-list">
          {result.review.map((item, index) => (
            <div className="review-item" key={item.id}>
              <p className="review-q">
                <span className="q-index">Q{index + 1}.</span> {item.text}
              </p>
              <div className="review-options">
                {item.options.map((opt, oi) => {
                  const isCorrect = oi === item.correctAnswer;
                  const isSelected = oi === item.selected;
                  let cls = "review-option";
                  if (isCorrect) cls += " correct";
                  if (isSelected && !isCorrect) cls += " wrong";
                  return (
                    <div className={cls} key={oi}>
                      <span className="opt-letter">{optionLetter(oi)}</span>
                      <span>{opt}</span>
                      {isCorrect && <span className="tag tag-correct">Correct</span>}
                      {isSelected && !isCorrect && <span className="tag tag-wrong">Your answer</span>}
                    </div>
                  );
                })}
              </div>
              {item.selected === null && <p className="not-answered">Not answered</p>}
              {item.explanation && <p className="explanation">{item.explanation}</p>}
            </div>
          ))}
        </div>

        <div className="creator-actions">
          <button className="btn btn-primary" onClick={onDone}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
