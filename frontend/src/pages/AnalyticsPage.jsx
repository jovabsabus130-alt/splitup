import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { PREDEFINED_CATEGORIES } from '../lib/constants';

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
            Structured spending breakdown, historical trends, and balances across periods
          </p>
        </div>

        {/* ── Scope & Period Filter Controls ── */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
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

          {/* ── Two Column Breakdowns: Category & Group/Member ───────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
            {/* ── Spending by Category ── */}
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Spending by Category</h2>
                  <div className="card-subtitle">{analytics.categoryBreakdown?.length || 0} categories logged</div>
                </div>
              </div>

              {analytics.categoryBreakdown?.length === 0 ? (
                <p className="no-requests-text" style={{ margin: 'var(--space-3) 0' }}>No category data available.</p>
              ) : (
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  {analytics.categoryBreakdown.map((cat) => (
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
                            background: 'var(--primary)',
                            borderRadius: '3px',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Spending by Group (Personal) OR Spending by Member (Group) ── */}
            {scope === 'personal' ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Spending by Group</h2>
                    <div className="card-subtitle">Distribution across your active groups</div>
                  </div>
                </div>

                {analytics.groupBreakdown?.length === 0 ? (
                  <p className="no-requests-text" style={{ margin: 'var(--space-3) 0' }}>No group spending recorded.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {analytics.groupBreakdown.map((grp) => (
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
                              background: '#38bdf8',
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Member Share Distribution</h2>
                    <div className="card-subtitle">Spending and shares per group participant</div>
                  </div>
                </div>

                {analytics.memberBreakdown?.length === 0 ? (
                  <p className="no-requests-text" style={{ margin: 'var(--space-3) 0' }}>No member activity recorded.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {analytics.memberBreakdown.map((m) => (
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
                              background: '#a855f7',
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                      </div>
                    ))}
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
        </>
      )}
    </div>
  );
}
