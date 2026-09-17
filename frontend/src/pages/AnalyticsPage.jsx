import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AIExpenseAnalysisModal from '../components/AIExpenseAnalysisModal';
import api from '../lib/api';
import { PREDEFINED_CATEGORIES } from '../lib/constants';

const CHART_COLORS = [
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

function getCategoryIcon(cat) {
  const found = PREDEFINED_CATEGORIES.find(
    (item) => item.label.toLowerCase() === (cat || '').toLowerCase()
  );
  return found ? found.icon : '🏷️';
}

export default function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialScope = searchParams.get('scope') === 'group' ? 'group' : 'personal';
  const initialPeriod = ['day', 'week', 'month'].includes(searchParams.get('period'))
    ? searchParams.get('period')
    : 'month';
  const initialGroupId = searchParams.get('groupId') || '';

  const [scope, setScope] = useState(initialScope);
  const [period, setPeriod] = useState(initialPeriod);
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);

  // View Mode States
  const [showAIModal, setShowAIModal] = useState(false);
  const [categoryChartType, setCategoryChartType] = useState('donut'); // 'bar' | 'donut'
  const [groupChartType, setGroupChartType] = useState('bar'); // 'bar' | 'donut'

  // Load user groups for selector
  useEffect(() => {
    async function loadGroups() {
      try {
        const { data } = await api.get('/api/groups');
        const userGroups = data.groups || [];
        setGroups(userGroups);
        if (!selectedGroupId && userGroups.length > 0 && initialScope === 'group') {
          setSelectedGroupId(userGroups[0].id);
        }
      } catch {
        setGroups([]);
      }
    }
    loadGroups();
  }, []);

  // Synchronize URL search params
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('scope', scope);
    params.set('period', period);
    if (scope === 'group' && selectedGroupId) {
      params.set('groupId', selectedGroupId);
    }
    setSearchParams(params, { replace: true });
  }, [scope, period, selectedGroupId]);

  // Fetch structured analytics data
  async function fetchAnalytics() {
    if (scope === 'group' && !selectedGroupId) {
      setLoading(false);
      setAnalytics(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const queryParams = new URLSearchParams({
        scope,
        period,
      });
      if (scope === 'group' && selectedGroupId) {
        queryParams.set('groupId', selectedGroupId);
      }

      const { data } = await api.get(`/api/analytics?${queryParams.toString()}`);
      setAnalytics(data.analytics);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load analytics data.');
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalytics();
  }, [scope, period, selectedGroupId]);

  const maxTrendAmount = Math.max(
    ...(analytics?.trend?.map((t) => t.amount) || [0]),
    1
  );

  // Contextual AI Smart Insights based on current analytics
  const aiInsights = useMemo(() => {
    if (!analytics || analytics.totalSpending === 0) return null;
    const topCat = analytics.categoryBreakdown?.[0];
    const total = analytics.totalSpending;
    const tips = [];

    if (topCat) {
      if (topCat.percentage >= 40) {
        tips.push({
          icon: '⚠️',
          title: `Heavy ${topCat.category} Outlay`,
          desc: `${topCat.category} accounts for ${topCat.percentage}% (₹${topCat.amount.toFixed(2)}) of your total spending. Consider tracking recurring expenses in this area.`,
        });
      } else {
        tips.push({
          icon: '🏷️',
          title: `Top Spending Category: ${topCat.category}`,
          desc: `You spent ₹${topCat.amount.toFixed(2)} (${topCat.percentage}%) across ${topCat.count} transactions in ${topCat.category}.`,
        });
      }
    }

    if (scope === 'personal') {
      if (analytics.amountReceivable > 0) {
        tips.push({
          icon: '💰',
          title: 'Pending Receivables',
          desc: `You are owed ₹${analytics.amountReceivable.toFixed(2)} across groups. Initiating settlements can help recover funds faster.`,
        });
      }
      if (analytics.amountOwed > 0) {
        tips.push({
          icon: '⚖️',
          title: 'Outstanding Payables',
          desc: `You have ₹${analytics.amountOwed.toFixed(2)} in shared dues. Keeping balances clear avoids debt accumulation.`,
        });
      }
    } else {
      if (analytics.userBalance?.userNetBalance > 0) {
        tips.push({
          icon: '✨',
          title: 'Favorable Group Net Balance',
          desc: `The group owes you ₹${analytics.userBalance.userNetBalance.toFixed(2)}. Check the group settlement ledger for detailed payouts.`,
        });
      } else if (analytics.userBalance?.userNetBalance < 0) {
        tips.push({
          icon: '💳',
          title: 'Group Balance Settlement Needed',
          desc: `Your current net share in this group is ₹${Math.abs(analytics.userBalance.userNetBalance).toFixed(2)}. Use Settle Up to clear dues.`,
        });
      }
    }

    if (analytics.highestExpenses && analytics.highestExpenses.length > 0) {
      const topExpense = analytics.highestExpenses[0];
      tips.push({
        icon: '📊',
        title: `Single Largest Transaction: ${topExpense.description}`,
        desc: `Amount: ₹${(scope === 'personal' ? topExpense.userShare : topExpense.amount).toFixed(2)} in ${topExpense.category}.`,
      });
    }

    return tips;
  }, [analytics, scope, period]);

  // Donut SVG Renderer Helper
  function renderDonutChart(items, totalAmount, colorPalette = CHART_COLORS, isCategory = false) {
    if (!items || items.length === 0 || totalAmount <= 0) return null;
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    let accumulatedPercent = 0;

    return (
      <div className="analytics-donut-container">
        <div className="donut-svg-wrap">
          <svg viewBox="0 0 120 120" width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
            {items.map((item, idx) => {
              const color = colorPalette[idx % colorPalette.length];
              const pct = (item.percentage !== undefined ? Number(item.percentage) : (item.amount / totalAmount) * 100) / 100;
              const strokeDasharray = `${pct * circumference} ${circumference}`;
              const strokeDashoffset = -accumulatedPercent * circumference;
              accumulatedPercent += pct;

              return (
                <circle
                  key={item.category || item.groupName || item.name || idx}
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
            })}
          </svg>
          <div className="donut-center-label">
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>
              Total
            </span>
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              ₹{Number(totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </strong>
          </div>
        </div>

        <div className="donut-legend-list">
          {items.map((item, idx) => {
            const color = colorPalette[idx % colorPalette.length];
            const name = item.category || item.groupName || item.name;
            const pct = item.percentage !== undefined ? item.percentage : ((item.amount / totalAmount) * 100).toFixed(1);
            const amt = item.amount !== undefined ? item.amount : item.shareAmount || 0;

            return (
              <div key={name || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isCategory ? `${getCategoryIcon(item.category)} ${name}` : name}
                  </span>
                </div>
                <strong style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  ₹{Number(amt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '4px' }}>({pct}%)</span>
                </strong>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-page" style={{ display: 'grid', gap: 'var(--space-6)' }}>
      {/* ── Page Header & Controls ────────────────────────────────────────── */}
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📈</span>
            <span>Analytics & Insights</span>
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '13.5px' }}>
            Structured spending breakdown, AI recommendations, and interactive charts
          </p>
        </div>

        {/* ── Scope, Period & AI Action Controls ── */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* AI Analysis Modal Button */}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowAIModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '34px',
              padding: '0 12px',
              fontSize: '12.5px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
              borderColor: 'rgba(99, 102, 241, 0.3)',
              color: 'var(--text-primary)',
            }}
            title="Open AI Monthly Spending Analysis"
          >
            <span>✨</span>
            <span>AI Spend Analysis</span>
          </button>

          {/* Scope Toggle: Personal vs Group */}
          <div className="analytics-toggle-group" style={{ display: 'inline-flex', background: 'var(--bg-subtle)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              id="analytics-scope-personal"
              className={`btn-ghost ${scope === 'personal' ? 'active' : ''}`}
              style={{
                height: '32px',
                padding: '0 12px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: 'var(--radius-xs)',
                background: scope === 'personal' ? 'var(--bg-surface)' : 'transparent',
                color: scope === 'personal' ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: scope === 'personal' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
              onClick={() => setScope('personal')}
            >
              Personal
            </button>
            <button
              type="button"
              id="analytics-scope-group"
              className={`btn-ghost ${scope === 'group' ? 'active' : ''}`}
              style={{
                height: '32px',
                padding: '0 12px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: 'var(--radius-xs)',
                background: scope === 'group' ? 'var(--bg-surface)' : 'transparent',
                color: scope === 'group' ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: scope === 'group' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
              onClick={() => {
                setScope('group');
                if (!selectedGroupId && groups.length > 0) {
                  setSelectedGroupId(groups[0].id);
                }
              }}
            >
              Group
            </button>
          </div>

          {/* Group Selector when in Group Scope */}
          {scope === 'group' && (
            <select
              id="analytics-group-select"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              style={{ height: '38px', minWidth: '160px', fontSize: '13px', padding: '0 8px' }}
            >
              {groups.length === 0 ? (
                <option value="">No groups found</option>
              ) : (
                groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))
              )}
            </select>
          )}

          {/* Period Toggle: Day / Week / Month */}
          <div className="analytics-period-group" style={{ display: 'inline-flex', background: 'var(--bg-subtle)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            {['day', 'week', 'month'].map((p) => (
              <button
                key={p}
                type="button"
                id={`analytics-period-${p}`}
                className={`btn-ghost ${period === p ? 'active' : ''}`}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  borderRadius: 'var(--radius-xs)',
                  background: period === p ? 'var(--primary)' : 'transparent',
                  color: period === p ? '#ffffff' : 'var(--text-secondary)',
                }}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Active Period Label & Quick Navigation ─────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Viewing: <strong style={{ color: 'var(--text-primary)' }}>{analytics?.periodLabel || period}</strong>
          {scope === 'group' && analytics?.groupName && ` in ${analytics.groupName}`}
        </div>
        {scope === 'group' && selectedGroupId && (
          <Link to={`/groups/${selectedGroupId}`} className="btn-ghost" style={{ fontSize: '12.5px', height: '28px' }}>
            Go to Group Detail ➔
          </Link>
        )}
      </div>

      {/* ── Error Banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', padding: 'var(--space-3)' }}>
          <p style={{ margin: 0, color: 'var(--danger)', fontSize: '13.5px' }}>{error}</p>
        </div>
      )}

      {/* ── Loading State ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <div className="spinner" style={{ margin: '0 auto var(--space-3) auto' }} />
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>Loading analytics calculations…</p>
        </div>
      ) : !analytics ? null : (
        <>
          {/* ── Top Summary Metric Cards ── */}
          <div className="analytics-kpi-grid">
            {/* Total Spending KPI */}
            <div className="card" style={{ margin: 0 }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {scope === 'personal' ? 'Your Spending' : 'Total Group Spending'}
              </span>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: 'var(--space-1)', fontVariantNumeric: 'tabular-nums' }}>
                ₹{Number(analytics.totalSpending || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Across {analytics.periodLabel}
              </span>
            </div>

            {/* Outstanding Balance KPI: Owed vs Receivable */}
            {scope === 'personal' ? (
              <>
                <div className="card" style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    You Are Owed (Receivable)
                  </span>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--success)', marginTop: 'var(--space-1)', fontVariantNumeric: 'tabular-nums' }}>
                    +₹{Number(analytics.amountReceivable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Across all your active groups
                  </span>
                </div>

                <div className="card" style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    You Owe (Payable)
                  </span>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: analytics.amountOwed > 0 ? 'var(--danger)' : 'var(--text-primary)', marginTop: 'var(--space-1)', fontVariantNumeric: 'tabular-nums' }}>
                    {analytics.amountOwed > 0 ? '-' : ''}₹{Number(analytics.amountOwed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Net balance: <strong style={{ color: analytics.netBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>{analytics.netBalance >= 0 ? '+' : ''}₹{analytics.netBalance.toFixed(2)}</strong>
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="card" style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Your Net Position in Group
                  </span>
                  <div
                    style={{
                      fontSize: '28px',
                      fontWeight: 700,
                      color: analytics.userBalance?.userNetBalance > 0 ? 'var(--success)' : analytics.userBalance?.userNetBalance < 0 ? 'var(--danger)' : 'var(--text-primary)',
                      marginTop: 'var(--space-1)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {analytics.userBalance?.userNetBalance > 0 ? '+' : ''}₹{Number(analytics.userBalance?.userNetBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {analytics.userBalance?.userNetBalance > 0 ? 'You are owed money' : analytics.userBalance?.userNetBalance < 0 ? 'You need to settle up' : 'All settled up'}
                  </span>
                </div>

                <div className="card" style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Active Members Logged
                  </span>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: 'var(--space-1)' }}>
                    {analytics.memberBreakdown?.length || 0}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Participants in {analytics.groupName}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* ── AI Spending Recommendations & Insights Card ─────────────────── */}
          {aiInsights && aiInsights.length > 0 && (
            <section className="ai-recommendation-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="ai-recommendation-badge">
                    <span>✨</span>
                    <span>AI Spending Insights & Recommendations</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowAIModal(true)}
                  style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--accent-primary)', padding: '2px 8px' }}
                >
                  Full AI Report ➔
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
                {aiInsights.map((tip, idx) => (
                  <div key={idx} className="ai-tip-item">
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{tip.icon}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{tip.title}</strong>
                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{tip.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Spending Trend Section ───────────────────────────────────────── */}
          <section className="card">
            <div className="card-header" style={{ marginBottom: 'var(--space-3)' }}>
              <div>
                <h2 className="card-title">Spending Trend</h2>
                <div className="card-subtitle">
                  {period === 'day' ? 'Hourly distribution' : period === 'week' ? 'Daily activity over the week' : 'Daily timeline across the month'}
                </div>
              </div>
            </div>

            {/* Zero state check */}
            {analytics.totalSpending === 0 ? (
              <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px' }}>
                No spending recorded for this {period}.
              </div>
            ) : (
              <div style={{ overflowX: 'hidden', padding: '12px 0 6px 0' }}>
                {/* Responsive SVG Bar Chart */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: period === 'month' ? '2px' : '8px', height: '160px', width: '100%', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
                  {analytics.trend.map((point, idx) => {
                    const heightPercent = maxTrendAmount > 0 ? Math.max((point.amount / maxTrendAmount) * 100, point.amount > 0 ? 6 : 0) : 0;
                    return (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                          justifyContent: 'flex-end',
                          position: 'relative',
                        }}
                        title={`${point.label}: ₹${point.amount.toFixed(2)}`}
                      >
                        {/* Bar */}
                        <div
                          style={{
                            width: '100%',
                            maxWidth: period === 'month' ? '18px' : '40px',
                            height: `${heightPercent}%`,
                            background: point.amount > 0 ? 'var(--primary)' : 'var(--bg-subtle)',
                            borderRadius: '3px 3px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* X-Axis Labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {period === 'day' ? (
                    <>
                      <span>00:00</span>
                      <span>06:00</span>
                      <span>12:00</span>
                      <span>18:00</span>
                      <span>23:00</span>
                    </>
                  ) : period === 'week' ? (
                    analytics.trend.map((p, idx) => <span key={idx}>{p.label}</span>)
                  ) : (
                    <>
                      <span>Day 1</span>
                      <span>Day 10</span>
                      <span>Day 20</span>
                      <span>Day {analytics.trend.length}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Two Column Breakdowns: Category & Group/Member (with Donut / Bar toggles) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'var(--space-4)' }}>
            {/* ── Spending by Category ── */}
            <section className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <div>
                  <h2 className="card-title">Spending by Category</h2>
                  <div className="card-subtitle">{analytics.categoryBreakdown?.length || 0} categories logged</div>
                </div>

                {/* Donut vs Bar View Toggle */}
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-subtle)', padding: '2px', borderRadius: 'var(--radius-sm)' }}>
                  <button
                    type="button"
                    className={`btn-ghost ${categoryChartType === 'donut' ? 'active' : ''}`}
                    style={{
                      height: '26px',
                      padding: '0 8px',
                      fontSize: '11.5px',
                      fontWeight: categoryChartType === 'donut' ? 700 : 500,
                      background: categoryChartType === 'donut' ? 'var(--bg-surface)' : 'transparent',
                      borderRadius: 'var(--radius-xs)',
                    }}
                    onClick={() => setCategoryChartType('donut')}
                  >
                    🍩 Donut
                  </button>
                  <button
                    type="button"
                    className={`btn-ghost ${categoryChartType === 'bar' ? 'active' : ''}`}
                    style={{
                      height: '26px',
                      padding: '0 8px',
                      fontSize: '11.5px',
                      fontWeight: categoryChartType === 'bar' ? 700 : 500,
                      background: categoryChartType === 'bar' ? 'var(--bg-surface)' : 'transparent',
                      borderRadius: 'var(--radius-xs)',
                    }}
                    onClick={() => setCategoryChartType('bar')}
                  >
                    📊 Bar
                  </button>
                </div>
              </div>

              {analytics.categoryBreakdown?.length === 0 ? (
                <p className="no-requests-text" style={{ margin: 'var(--space-3) 0' }}>No category data available.</p>
              ) : categoryChartType === 'donut' ? (
                renderDonutChart(analytics.categoryBreakdown, analytics.totalSpending, CHART_COLORS, true)
              ) : (
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  {analytics.categoryBreakdown.map((cat, idx) => {
                    const color = CHART_COLORS[idx % CHART_COLORS.length];
                    return (
                      <div key={cat.category} style={{ display: 'grid', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13.5px' }}>
                          <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{getCategoryIcon(cat.category)}</span>
                            <span>{cat.category}</span>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>({cat.count} tx)</span>
                          </span>
                          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                            ₹{cat.amount.toFixed(2)}{' '}
                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 400 }}>({cat.percentage}%)</span>
                          </strong>
                        </div>
                        {/* Progress Bar */}
                        <div style={{ height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${cat.percentage}%`,
                              background: color,
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Spending by Group (Personal) OR Spending by Member (Group) ── */}
            {scope === 'personal' ? (
              <section className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div>
                    <h2 className="card-title">Spending by Group</h2>
                    <div className="card-subtitle">Distribution across your active groups</div>
                  </div>

                  {/* Donut vs Bar View Toggle */}
                  <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-subtle)', padding: '2px', borderRadius: 'var(--radius-sm)' }}>
                    <button
                      type="button"
                      className={`btn-ghost ${groupChartType === 'donut' ? 'active' : ''}`}
                      style={{
                        height: '26px',
                        padding: '0 8px',
                        fontSize: '11.5px',
                        fontWeight: groupChartType === 'donut' ? 700 : 500,
                        background: groupChartType === 'donut' ? 'var(--bg-surface)' : 'transparent',
                        borderRadius: 'var(--radius-xs)',
                      }}
                      onClick={() => setGroupChartType('donut')}
                    >
                      🍩 Donut
                    </button>
                    <button
                      type="button"
                      className={`btn-ghost ${groupChartType === 'bar' ? 'active' : ''}`}
                      style={{
                        height: '26px',
                        padding: '0 8px',
                        fontSize: '11.5px',
                        fontWeight: groupChartType === 'bar' ? 700 : 500,
                        background: groupChartType === 'bar' ? 'var(--bg-surface)' : 'transparent',
                        borderRadius: 'var(--radius-xs)',
                      }}
                      onClick={() => setGroupChartType('bar')}
                    >
                      📊 Bar
                    </button>
                  </div>
                </div>

                {analytics.groupBreakdown?.length === 0 ? (
                  <p className="no-requests-text" style={{ margin: 'var(--space-3) 0' }}>No group spending recorded.</p>
                ) : groupChartType === 'donut' ? (
                  renderDonutChart(analytics.groupBreakdown, analytics.totalSpending, CHART_COLORS, false)
                ) : (
                  <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {analytics.groupBreakdown.map((grp, idx) => {
                      const color = CHART_COLORS[idx % CHART_COLORS.length];
                      return (
                        <div key={grp.groupId} style={{ display: 'grid', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13.5px' }}>
                            <Link
                              to={`/groups/${grp.groupId}`}
                              style={{ fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}
                            >
                              {grp.groupName}
                            </Link>
                            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                              ₹{grp.amount.toFixed(2)}{' '}
                              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 400 }}>({grp.percentage}%)</span>
                            </strong>
                          </div>
                          <div style={{ height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${grp.percentage}%`,
                                background: color,
                                borderRadius: '3px',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <section className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div>
                    <h2 className="card-title">Member Share Distribution</h2>
                    <div className="card-subtitle">Spending and shares per group participant</div>
                  </div>

                  {/* Donut vs Bar View Toggle */}
                  <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-subtle)', padding: '2px', borderRadius: 'var(--radius-sm)' }}>
                    <button
                      type="button"
                      className={`btn-ghost ${groupChartType === 'donut' ? 'active' : ''}`}
                      style={{
                        height: '26px',
                        padding: '0 8px',
                        fontSize: '11.5px',
                        fontWeight: groupChartType === 'donut' ? 700 : 500,
                        background: groupChartType === 'donut' ? 'var(--bg-surface)' : 'transparent',
                        borderRadius: 'var(--radius-xs)',
                      }}
                      onClick={() => setGroupChartType('donut')}
                    >
                      🍩 Donut
                    </button>
                    <button
                      type="button"
                      className={`btn-ghost ${groupChartType === 'bar' ? 'active' : ''}`}
                      style={{
                        height: '26px',
                        padding: '0 8px',
                        fontSize: '11.5px',
                        fontWeight: groupChartType === 'bar' ? 700 : 500,
                        background: groupChartType === 'bar' ? 'var(--bg-surface)' : 'transparent',
                        borderRadius: 'var(--radius-xs)',
                      }}
                      onClick={() => setGroupChartType('bar')}
                    >
                      📊 Bar
                    </button>
                  </div>
                </div>

                {analytics.memberBreakdown?.length === 0 ? (
                  <p className="no-requests-text" style={{ margin: 'var(--space-3) 0' }}>No member activity recorded.</p>
                ) : groupChartType === 'donut' ? (
                  renderDonutChart(
                    analytics.memberBreakdown.map((m) => ({ ...m, amount: m.shareAmount })),
                    analytics.totalSpending,
                    CHART_COLORS,
                    false
                  )
                ) : (
                  <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {analytics.memberBreakdown.map((m, idx) => {
                      const color = CHART_COLORS[idx % CHART_COLORS.length];
                      return (
                        <div key={m.userId} style={{ display: 'grid', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13.5px' }}>
                            <span style={{ fontWeight: 500 }}>
                              {m.name}
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                Paid: ₹{m.paidAmount.toFixed(2)}
                              </span>
                            </span>
                            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                              ₹{m.shareAmount.toFixed(2)}{' '}
                              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 400 }}>({m.percentage}%)</span>
                            </strong>
                          </div>
                          <div style={{ height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${m.percentage}%`,
                                background: color,
                                borderRadius: '3px',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* ── Highest Expenses in Period ────────────────────────────────────── */}
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Highest Expenses</h2>
                <div className="card-subtitle">Top transactions in {analytics.periodLabel}</div>
              </div>
            </div>

            {analytics.highestExpenses?.length === 0 ? (
              <p className="no-requests-text" style={{ margin: 'var(--space-3) 0' }}>No transactions recorded in this period.</p>
            ) : (
              <ul className="list">
                {analytics.highestExpenses.map((exp) => (
                  <li key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span style={{ fontSize: '18px' }}>{getCategoryIcon(exp.category)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {exp.description}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {scope === 'personal' ? `${exp.groupName} • ` : ''}Paid by {exp.paidBy} &bull; {new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        ₹{scope === 'personal' ? exp.userShare.toFixed(2) : exp.amount.toFixed(2)}
                      </div>
                      {scope === 'personal' && exp.totalAmount !== exp.userShare && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Total: ₹{exp.totalAmount.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── AI Expense Analysis Modal ── */}
          <AIExpenseAnalysisModal
            isOpen={showAIModal}
            onClose={() => setShowAIModal(false)}
            defaultGroupId={scope === 'group' ? selectedGroupId : null}
          />
        </>
      )}
    </div>
  );
}

