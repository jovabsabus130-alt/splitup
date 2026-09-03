import { useEffect, useState } from 'react';
import api from '../lib/api';

const CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#64748b', // slate
  '#14b8a6', // teal
  '#6366f1', // indigo
];

export default function AIExpenseAnalysisModal({ onClose, defaultGroupId = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [error, setError] = useState('');
  const [chartType, setChartType] = useState('bar'); // 'bar' | 'donut'

  async function loadAnalysis(monthKey = selectedMonth) {
    setLoading(true);
    setError('');
    try {
      let url = '/api/dashboard/ai-analysis';
      const params = new URLSearchParams();
      if (monthKey) params.append('month', monthKey);
      if (defaultGroupId) params.append('groupId', defaultGroupId);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await api.get(url);
      setData(res.data);
      if (!selectedMonth && res.data.selectedMonth) {
        setSelectedMonth(res.data.selectedMonth);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load expense analysis');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalysis();
  }, [defaultGroupId]);

  function handleMonthChange(newMonth) {
    setSelectedMonth(newMonth);
    loadAnalysis(newMonth);
  }

  const categoryBreakdown = data?.categoryBreakdown || [];
  const maxAmount = categoryBreakdown.length > 0 ? Math.max(...categoryBreakdown.map((c) => c.amount)) : 1;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-analysis-title"
    >
      <div className="modal-box" style={{ maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }}>
        {onClose && (
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        )}

        {/* ── Header ── */}
        <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '14px',
                }}
              >
                ✨
              </div>
              <h2 id="ai-analysis-title" className="card-title">AI Monthly Expense Analysis</h2>
            </div>
            <div className="card-subtitle">
              Deep spending patterns, category distributions & AI smart observations
            </div>
          </div>
        </div>

        {/* ── Month Selector & Controls ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3)',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Period:
            </span>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              style={{ height: '32px', fontSize: '13px', fontWeight: 600 }}
            >
              {(data?.availableMonths || []).map((m) => {
                const [y, mo] = m.split('-').map(Number);
                const d = new Date(y, mo - 1, 15);
                const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                return (
                  <option key={m} value={m}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              className={`btn-ghost ${chartType === 'bar' ? 'active' : ''}`}
              style={{
                height: '30px',
                fontSize: '12px',
                padding: '0 10px',
                background: chartType === 'bar' ? 'var(--bg-surface)' : 'transparent',
                fontWeight: chartType === 'bar' ? 600 : 400,
                border: chartType === 'bar' ? '1px solid var(--border-subtle)' : 'none',
              }}
              onClick={() => setChartType('bar')}
            >
              📊 Bar Chart
            </button>
            <button
              type="button"
              className={`btn-ghost ${chartType === 'donut' ? 'active' : ''}`}
              style={{
                height: '30px',
                fontSize: '12px',
                padding: '0 10px',
                background: chartType === 'donut' ? 'var(--bg-surface)' : 'transparent',
                fontWeight: chartType === 'donut' ? 600 : 400,
                border: chartType === 'donut' ? '1px solid var(--border-subtle)' : 'none',
              }}
              onClick={() => setChartType('donut')}
            >
              🍩 Donut View
            </button>
          </div>
        </div>

        {error && <div className="error-text" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}

        {loading ? (
          <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div className="ai-btn-spinner" style={{ margin: '0 auto var(--space-3) auto', width: '24px', height: '24px', borderWidth: '3px' }} />
            Analyzing spending data & generating AI observations…
          </div>
        ) : !data || categoryBreakdown.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--space-10) var(--space-4)',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md)',
              marginTop: 'var(--space-4)',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
            <h3>No expenses found for {data?.monthName || 'this period'}</h3>
            <p style={{ maxWidth: '380px', margin: '8px auto 0 auto' }}>
              Add transactions in your groups to view AI monthly spending breakdowns and interactive visual charts.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
            {/* ── Summary Stats ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Total Spent</span>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
                  ₹{data.totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <small style={{ color: 'var(--text-muted)' }}>{data.transactionCount} transactions</small>
              </div>

              <div
                style={{
                  background: 'var(--bg-subtle)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Highest Spend Category</span>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-primary)', marginTop: '2px' }}>
                  {data.topCategory ? `${data.topCategory.category} (₹${data.topCategory.amount.toLocaleString('en-IN')})` : '—'}
                </div>
                <small style={{ color: 'var(--text-muted)' }}>
                  {data.topCategory ? `${data.topCategory.percentage}% of monthly outlay` : ''}
                </small>
              </div>
            </div>

            {/* ── Visual Chart Section ── */}
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600 }}>
                  Category-wise Expense Breakdown ({data.monthName})
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {categoryBreakdown.length} {categoryBreakdown.length === 1 ? 'category' : 'categories'}
                </span>
              </div>

              {chartType === 'bar' ? (
                /* ── Horizontal Bar Chart ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {categoryBreakdown.map((cat, idx) => {
                    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                    const barWidth = Math.max(8, Math.round((cat.amount / maxAmount) * 100));

                    return (
                      <div key={cat.category} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color }} />
                            {cat.category}
                          </span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--text-primary)' }}>
                            ₹{cat.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px', fontSize: '12px' }}>
                              ({cat.percentage}%)
                            </span>
                          </span>
                        </div>
                        <div
                          style={{
                            width: '100%',
                            height: '10px',
                            backgroundColor: 'var(--bg-subtle)',
                            borderRadius: 'var(--radius-full)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${barWidth}%`,
                              height: '100%',
                              backgroundColor: color,
                              borderRadius: 'var(--radius-full)',
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── Donut Chart View ── */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', alignItems: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <svg viewBox="0 0 120 120" width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
                      {(() => {
                        let accumulatedPercent = 0;
                        const radius = 42;
                        const circumference = 2 * Math.PI * radius;

                        return categoryBreakdown.map((cat, idx) => {
                          const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                          const pct = cat.percentage / 100;
                          const strokeDasharray = `${pct * circumference} ${circumference}`;
                          const strokeDashoffset = -accumulatedPercent * circumference;
                          accumulatedPercent += pct;

                          return (
                            <circle
                              key={cat.category}
                              cx="60"
                              cy="60"
                              r={radius}
                              fill="transparent"
                              stroke={color}
                              strokeWidth="18"
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                            />
                          );
                        });
                      })()}
                    </svg>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {categoryBreakdown.map((cat, idx) => {
                      const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                      return (
                        <div key={cat.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12.5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                            <span>{cat.category}</span>
                          </div>
                          <strong>₹{cat.amount.toLocaleString('en-IN')}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── AI Insights & Observations ── */}
            {data.aiInsights && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-2)' }}>
                  <span style={{ fontSize: '15px' }}>✨</span>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    AI Spending Observations & Insights
                  </h3>
                </div>

                {data.aiInsights.summary && (
                  <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: 'var(--space-3)' }}>
                    {data.aiInsights.summary}
                  </p>
                )}

                {data.aiInsights.keyObservations?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 'var(--space-2)' }}>
                    {data.aiInsights.keyObservations.map((obs, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <span style={{ color: '#6366f1', fontWeight: 700 }}>•</span>
                        <span>{obs}</span>
                      </div>
                    ))}
                  </div>
                )}

                {data.aiInsights.savingTips?.length > 0 && (
                  <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid rgba(99, 102, 241, 0.15)', paddingTop: 'var(--space-3)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      💡 Smart Recommendations:
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      {data.aiInsights.savingTips.map((tip, idx) => (
                        <div key={idx} style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                          &bull; {tip}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
