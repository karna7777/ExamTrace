// ExamTrace - Report Export
//
// Builds a standalone, printable HTML report from a finalized attempt's result.
// Used by the "Export report" action, which saves the file via a native save
// dialog (the user chooses where). Nothing is sent anywhere.

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMs(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + "m " + sec + "s";
}

function buildReportHtml(result) {
  const letter = (i) => String.fromCharCode(65 + i);

  const reviewRows = (result.review || [])
    .map((q, i) => {
      const options = q.options
        .map((opt, oi) => {
          const correct = oi === q.correctAnswer;
          const chosen = oi === q.selected;
          const tag = correct ? " (correct)" : chosen ? " (your answer)" : "";
          const style = correct ? "color:#166534;font-weight:600" : chosen ? "color:#b91c1c" : "";
          return '<li style="' + style + '">' + letter(oi) + ". " + esc(opt) + tag + "</li>";
        })
        .join("");
      return (
        '<div class="q"><p><strong>Q' + (i + 1) + ".</strong> " + esc(q.text) + "</p><ul>" + options + "</ul>" +
        (q.selected === null ? '<p class="na">Not answered</p>' : "") +
        (q.explanation ? '<p class="exp">' + esc(q.explanation) + "</p>" : "") +
        "</div>"
      );
    })
    .join("");

  const m = result.monitoringSummary || {};
  const timeline = (result.events || [])
    .map((e) => '<li>' + esc(new Date(e.timestamp).toLocaleTimeString()) + " - " + esc(e.type) + "</li>")
    .join("");

  return (
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>" +
    esc(result.title) +
    " - Report</title><style>" +
    "body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:800px;margin:30px auto;padding:0 20px;color:#1e293b}" +
    "h1{margin-bottom:4px}h2{margin-top:28px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}" +
    ".muted{color:#64748b}.grid{display:flex;gap:20px;flex-wrap:wrap;margin:12px 0}" +
    ".grid div{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px}" +
    ".q{border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:10px 0}ul{margin:6px 0}" +
    ".na{color:#64748b;font-style:italic}.exp{color:#64748b;border-top:1px dashed #e2e8f0;padding-top:6px}" +
    "</style></head><body>" +
    "<h1>" + esc(result.title) + "</h1>" +
    '<p class="muted">' + esc(result.candidateName) + " &middot; " +
    (result.submissionType === "auto" ? "Auto-submitted" : "Submitted") + " &middot; " +
    esc(result.endedAt ? new Date(result.endedAt).toLocaleString() : "") + "</p>" +
    "<h2>Performance</h2><div class=\"grid\">" +
    "<div><strong>" + result.percentage + "%</strong><br>Score</div>" +
    "<div><strong>" + result.score + "/" + result.totalQuestions + "</strong><br>Correct</div>" +
    "<div><strong>" + result.incorrect + "</strong><br>Incorrect</div>" +
    "<div><strong>" + result.unanswered + "</strong><br>Unanswered</div>" +
    "<div><strong>" + formatMs(result.timeUsedMs) + "</strong><br>Time used</div></div>" +
    "<h2>Monitoring summary</h2><div class=\"grid\">" +
    "<div><strong>" + (m.windowDepartures || 0) + "</strong><br>Window departures</div>" +
    "<div><strong>" + formatMs(m.totalAwayMs) + "</strong><br>Time away</div>" +
    "<div><strong>" + (m.fullscreenExits || 0) + "</strong><br>Fullscreen exits</div>" +
    "<div><strong>" + (m.idleEvents || 0) + "</strong><br>Inactivity events</div></div>" +
    '<p class="muted">These are recorded activity facts for review. They do not prove misconduct.</p>' +
    "<h2>Activity timeline</h2><ul>" + timeline + "</ul>" +
    "<h2>Answer review</h2>" + reviewRows +
    "</body></html>"
  );
}

module.exports = { buildReportHtml };
