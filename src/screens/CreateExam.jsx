// Exam Creator (Examiner Mode only). Creates a new exam or edits an existing
// one. Does basic checks in the UI for quick feedback, but the authoritative
// validation and authorization happen in Main (examService + IPC guard).
import React, { useEffect, useState } from "react";
import { api } from "../api.js";

// A fresh, empty question.
function emptyQuestion() {
  return { text: "", options: ["", "", "", ""], correctAnswer: 0, explanation: "" };
}

export default function CreateExam({ examId, onSaved, onCancel }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [existingId, setExistingId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!examId);
  // AI draft generation (optional, Groq)
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState(null);

  // For a new exam, default the duration to the examiner's configured default.
  // Also check whether AI generation is available (a Groq key is configured).
  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        if (!examId) setDurationMinutes(s.defaultDurationMinutes);
        setAiAvailable(!!s.groqConfigured);
      })
      .catch(() => {});
  }, [examId]);

  async function generateWithAI() {
    setAiError(null);
    if (!aiTopic.trim()) {
      setAiError("Enter a topic first.");
      return;
    }
    setAiBusy(true);
    try {
      const res = await api.generateQuestions(aiTopic, Number(aiCount));
      // Append drafts for the examiner to review and edit.
      setQuestions((prev) => {
        const drafts = res.questions.map((q) => ({
          text: q.text,
          options: [...q.options],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || ""
        }));
        // Drop a single empty starter question if it's still blank.
        const base = prev.length === 1 && !prev[0].text.trim() ? [] : prev;
        return base.concat(drafts);
      });
    } catch (err) {
      setAiError(String(err.message || err));
    } finally {
      setAiBusy(false);
    }
  }

  // If editing, load the full exam (including answer key) from Main.
  useEffect(() => {
    if (!examId) return;
    async function load() {
      try {
        const exam = await api.getExamForEdit(examId);
        setExistingId(exam.id);
        setTitle(exam.title);
        setSubject(exam.subject || "");
        setDescription(exam.description || "");
        setDurationMinutes(exam.durationMinutes);
        setQuestions(
          exam.questions.map((q) => ({
            id: q.id,
            text: q.text,
            options: [...q.options],
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || ""
          }))
        );
      } catch (err) {
        setError(String(err.message || err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId]);

  function updateQuestion(index, patch) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateOption(qIndex, oIndex, value) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const options = q.options.map((o, j) => (j === oIndex ? value : o));
        return { ...q, options };
      })
    );
  }

  function addQuestion() {
    setQuestions((prev) => prev.concat(emptyQuestion()));
  }

  function deleteQuestion(index) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);
    setBusy(true);
    const exam = {
      id: existingId || undefined,
      title,
      subject,
      description,
      durationMinutes: Number(durationMinutes),
      questions
    };
    try {
      await api.saveExam(exam);
      onSaved();
    } catch (err) {
      // Main returns clear validation messages.
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading exam...</p>;

  return (
    <div className="creator">
      <section className="panel">
        <h2>Exam details</h2>
        <label className="field-label">Title *</label>
        <input
          className="text-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Database Management Systems"
        />
        <div className="field-row">
          <div className="field-col">
            <label className="field-label">Subject</label>
            <input
              className="text-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. DBMS"
            />
          </div>
          <div className="field-col">
            <label className="field-label">Duration (minutes) *</label>
            <input
              className="text-input"
              type="number"
              min="1"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>
        </div>
        <label className="field-label">Description</label>
        <input
          className="text-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </section>

      {aiAvailable && (
        <section className="panel ai-panel">
          <h2>Draft with AI (Groq)</h2>
          <p className="muted">
            Generate draft questions from a topic, then review and verify each one before saving.
            Do not trust the generated correct answers without checking them.
          </p>
          <div className="field-row">
            <div className="field-col">
              <label className="field-label">Topic</label>
              <input
                className="text-input"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="e.g. Operating System scheduling"
              />
            </div>
            <div className="field-col" style={{ maxWidth: 140 }}>
              <label className="field-label">How many</label>
              <input
                className="text-input"
                type="number"
                min="1"
                max="10"
                value={aiCount}
                onChange={(e) => setAiCount(e.target.value)}
              />
            </div>
          </div>
          {aiError && <p className="status error">{aiError}</p>}
          <button className="btn btn-primary" onClick={generateWithAI} disabled={aiBusy}>
            {aiBusy ? "Generating..." : "Generate draft questions"}
          </button>
        </section>
      )}

      <div className="section-head">
        <h2>Questions ({questions.length})</h2>
        <button className="btn btn-primary" onClick={addQuestion}>
          + Add question
        </button>
      </div>

      {questions.map((q, qi) => (
        <section className="panel question-editor" key={qi}>
          <div className="question-editor-head">
            <span className="q-number">Question {qi + 1}</span>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => deleteQuestion(qi)}
              disabled={questions.length === 1}
              title={questions.length === 1 ? "An exam needs at least one question" : "Delete question"}
            >
              Delete
            </button>
          </div>

          <input
            className="text-input"
            value={q.text}
            onChange={(e) => updateQuestion(qi, { text: e.target.value })}
            placeholder="Question text"
          />

          <p className="hint-text">Select the correct option using the radio button.</p>
          {q.options.map((opt, oi) => (
            <div className="option-row" key={oi}>
              <input
                type="radio"
                name={"correct-" + qi}
                checked={q.correctAnswer === oi}
                onChange={() => updateQuestion(qi, { correctAnswer: oi })}
              />
              <input
                className="text-input option-input"
                value={opt}
                onChange={(e) => updateOption(qi, oi, e.target.value)}
                placeholder={"Option " + (oi + 1)}
              />
            </div>
          ))}

          <label className="field-label">Explanation (optional)</label>
          <input
            className="text-input"
            value={q.explanation}
            onChange={(e) => updateQuestion(qi, { explanation: e.target.value })}
            placeholder="Shown in the result review after submission"
          />
        </section>
      ))}

      {error && <p className="status error">{error}</p>}

      <div className="creator-actions">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={busy}>
          {busy ? "Saving..." : existingId ? "Save changes" : "Save exam"}
        </button>
      </div>
    </div>
  );
}
