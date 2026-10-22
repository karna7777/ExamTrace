// ExamTrace - Groq AI Question Generation (optional)
//
// Generates DRAFT multiple-choice questions from a topic using the Groq API.
// This runs in the Main process so the API key never reaches the renderer.
// The examiner must review and verify every generated question before saving -
// AI answers are not trusted automatically.
//
// Limitation to explain in the viva: bundling an API key in a locally
// distributed desktop app is not truly secret - a user with file access can read
// the local settings file. For a real product the key would live on a server.

const settingsService = require("./settingsService.cjs");

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";

async function generateQuestions(topic, count) {
  const t = typeof topic === "string" ? topic.trim() : "";
  if (!t) throw new Error("Please enter a topic.");
  const n = Math.min(10, Math.max(1, Number(count) || 5));

  const settings = await settingsService.getSettings();
  const key = settings.groqApiKey;
  if (!key) throw new Error("Groq API key is not configured. Add it in Settings.");

  const prompt =
    "Generate " + n + ' multiple-choice questions about "' + t + '". ' +
    "Each question must have exactly 4 options and exactly one correct answer. " +
    'Respond ONLY with JSON in this shape: ' +
    '{"questions":[{"text":"...","options":["a","b","c","d"],"correctIndex":0,"explanation":"..."}]}';

  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You write exam questions and always reply with valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
        response_format: { type: "json_object" }
      })
    });
  } catch {
    throw new Error("Could not reach Groq. Check your internet connection.");
  }

  if (!res.ok) {
    throw new Error(
      "Groq request failed (" + res.status + ")." + (res.status === 401 ? " Check your API key." : "")
    );
  }

  const data = await res.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "{}";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Groq returned an unexpected format. Please try again.");
  }

  const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions = [];
  for (const q of raw) {
    if (!q || typeof q.text !== "string" || !q.text.trim()) continue;
    if (!Array.isArray(q.options) || q.options.length !== 4) continue;
    if (q.options.some((o) => typeof o !== "string" || !o.trim())) continue;
    let ci = Number(q.correctIndex);
    if (!Number.isInteger(ci) || ci < 0 || ci > 3) ci = 0;
    questions.push({
      text: q.text.trim(),
      options: q.options.map((o) => o.trim()),
      correctAnswer: ci,
      explanation: typeof q.explanation === "string" ? q.explanation.trim() : ""
    });
  }

  if (questions.length === 0) {
    throw new Error("No valid questions were generated. Try a different topic.");
  }
  return { questions };
}

module.exports = { generateQuestions };
