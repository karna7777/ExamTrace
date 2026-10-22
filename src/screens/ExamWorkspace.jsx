// The candidate examination workspace. This is a dedicated full-screen workflow
// screen (the normal sidebar is hidden while it is shown).
//
// It restores itself from Main on mount (so a React reload does not lose the
// exam), displays the Main-authoritative timer, saves answers/review flags
// through Main, and uses an IN-APP confirmation modal for submission (a native
// dialog could steal focus and create a false monitoring event).
import React, { useEffect, useRef, useState } from "react";
import { api, formatTime } from "../api.js";
import QuestionPalette from "../components/QuestionPalette.jsx";
import Modal from "../components/Modal.jsx";

export default function ExamWorkspace({ onFinish }) {
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState([]);
  const [remainingMs, setRemainingMs] = useState(0);
  const [showSubmit, setShowSubmit] = useState(false);
  const [error, setError] = useState(null);
  const finishedRef = useRef(false);

  // Restore the active exam from Main and subscribe to timer + completion events.
  useEffect(() => {
    const cleanupTimer = api.onTimerUpdate((payload) => {
      setRemainingMs(payload.remainingMs);
    });
    const cleanupCompleted = api.onExamCompleted((result) => {
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinish(result);
      }
    });

    async function init() {
      const active = await api.getActiveExam();
      if (!active) {
        // No active exam (e.g. it finished elsewhere) - leave the workspace.
        onFinish(null);
        return;
      }
      setExam(active);
      setAnswers(active.answers || {});
      setMarked(active.markedForReview || []);
      setRemainingMs(active.remainingMs);
      setLoading(false);
    }
    init();

    return () => {
      cleanupTimer();
      cleanupCompleted();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !exam) {
    return <div className="centered-screen muted">Loading examination...</div>;
  }

  const questions = exam.questions;
  const current = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;
  const isMarked = marked.includes(current.id);
  const timeLow = remainingMs <= 60000;

  async function selectAnswer(optionIndex) {
    setError(null);
    try {
      await api.saveAnswer(current.id, optionIndex);
      setAnswers((prev) => ({ ...prev, [current.id]: optionIndex }));
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  async function toggleMark() {
    try {
      await api.markForReview(current.id, !isMarked);
      setMarked((prev) => (isMarked ? prev.filter((id) => id !== current.id) : prev.concat(current.id)));
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  async function confirmSubmit() {
    setShowSubmit(false);
    try {
      // The "exam:completed" event drives onFinish, so we just trigger it here.
      await api.submitExam();
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  return (
    <div className="exam-screen">
      <header className="exam-topbar">
        <div className="exam-topbar-left">
          <span className="exam-topbar-title">{exam.title}</span>
          <span className="exam-topbar-sub">
            Question {currentIndex + 1} of {questions.length}
          </span>
        </div>
        <div className="exam-topbar-right">
          <span className="monitoring-pill">Monitoring: on (Phase 4)</span>
          <span className={"timer" + (timeLow ? " danger" : "")}>{formatTime(remainingMs)}</span>
          <button className="btn btn-primary" onClick={() => setShowSubmit(true)}>
            Submit
          </button>
        </div>
      </header>

      <div className="exam-body">
        <main className="question-area">
          <div className="question-card">
            <p className="question-text">{current.text}</p>
            <div className="options">
              {current.options.map((opt, oi) => (
                <label
                  key={oi}
                  className={"option-choice" + (answers[current.id] === oi ? " selected" : "")}
                >
                  <input
                    type="radio"
                    name={"q-" + current.id}
                    checked={answers[current.id] === oi}
                    onChange={() => selectAnswer(oi)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>

            {error && <p className="status error">{error}</p>}

            <div className="question-nav">
              <button
                className="btn btn-ghost"
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
              >
                Previous
              </button>
              <button
                className={"btn " + (isMarked ? "btn-primary" : "btn-ghost")}
                onClick={toggleMark}
              >
                {isMarked ? "Unmark review" : "Mark for review"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                disabled={currentIndex === questions.length - 1}
              >
                Next
              </button>
            </div>
          </div>
        </main>

        <aside className="exam-aside">
          <QuestionPalette
            questions={questions}
            answers={answers}
            marked={marked}
            currentIndex={currentIndex}
            onJump={setCurrentIndex}
          />
        </aside>
      </div>

      {showSubmit && (
        <Modal title="Submit Examination?" onClose={() => setShowSubmit(false)}>
          <p className="muted">Review your progress before submitting.</p>
          <ul className="info-list">
            <li>
              <span className="label">Answered</span>
              <span className="value">{answeredCount} / {questions.length}</span>
            </li>
            <li>
              <span className="label">Unanswered</span>
              <span className="value">{unansweredCount} / {questions.length}</span>
            </li>
            <li>
              <span className="label">Time remaining</span>
              <span className="value">{formatTime(remainingMs)}</span>
            </li>
          </ul>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowSubmit(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmSubmit}>
              Submit Examination
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
