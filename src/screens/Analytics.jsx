// Analytics (Examiner Mode). All numbers are derived from real saved attempts -
// no fake data. Uses a simple CSS bar chart (no chart library).
import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Analytics() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setAttempts(await api.getExamHistory());
      } catch (err) {
        setError(String(err.message || err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="muted">Loading analytics...</p>;
  if (error) return <p className="status error">{error}</p>;

  if (attempts.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">No data yet</p>
        <p className="muted">Analytics appear once examinations have been attempted.</p>
      </div>
    );
  }

  const total = attempts.length;
  const avg = Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / total);
  const highest = Math.max(...attempts.map((a) => a.percentage));
  const totalEvents = attempts.reduce((s, a) => s + a.monitoringEvents, 0);

  // Recent performance: last 10 attempts, oldest -> newest for the chart.
  const recent = [...attempts].slice(0, 10).reverse();

  return (
    <div>
      <div className="stat-row">
        <Stat label="Total attempts" value={total} />
        <Stat label="Average score" value={avg + "%"} />
        <Stat label="Highest score" value={highest + "%"} />
        <Stat label="Monitoring events" value={totalEvents} />
      </div>

      <section className="panel">
        <h2>Recent performance</h2>
        <p className="muted">Scores from the most recent attempts.</p>
        <div className="bar-chart">
          {recent.map((a) => (
            <div className="bar-col" key={a.attemptId} title={a.title + " - " + a.percentage + "%"}>
              <div className="bar-track">
                <div className="bar-fill" style={{ height: a.percentage + "%" }} />
              </div>
              <span className="bar-value">{a.percentage}%</span>
              <span className="bar-label">{a.candidateName.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </section>
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
