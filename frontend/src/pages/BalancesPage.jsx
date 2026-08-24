import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../lib/api';

export default function BalancesPage() {
  const { groupId } = useParams();
  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('splitup_user');
    return raw ? JSON.parse(raw) : null;
  }, []);

  async function loadData() {
    setError('');
    try {
      const [balancesRes, groupRes] = await Promise.all([
        api.get(`/api/groups/${groupId}/balances`),
        api.get(`/api/groups/${groupId}`).catch(() => ({ data: { group: null } })),
      ]);
      setBalances(balancesRes.data.balances || []);
      setSettlements(balancesRes.data.settlements || []);
      setHistory(balancesRes.data.history || []);
      if (groupRes.data.group) setGroup(groupRes.data.group);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to load balances');
    }
  }

  useEffect(() => {
    loadData();
  }, [groupId]);

  // Overall User Summary Calculation
  const userSummary = useMemo(() => {
    if (!currentUser) return null;
    const userBalance = balances.find((b) => b.userId === currentUser.id);
    const net = userBalance ? Number(userBalance.netBalance) : 0;

    const debtsToPay = settlements.filter(
      (s) => s.from === currentUser.id && s.status !== 'completed'
    );
    const totalToPay = debtsToPay.reduce((acc, s) => acc + Number(s.amount), 0);

    const debtsToReceive = settlements.filter(
      (s) => s.to === currentUser.id && s.status !== 'completed'
    );
    const totalToReceive = debtsToReceive.reduce((acc, s) => acc + Number(s.amount), 0);

    return {
      net,
      totalToPay,
      totalToReceive,
      debtsToPayCount: debtsToPay.length,
      debtsToReceiveCount: debtsToReceive.length,
    };
  }, [balances, settlements, currentUser]);

  async function handleMarkSettled(settlementId) {
    setMessage('');
    setError('');
    try {
      await api.post(`/api/groups/${groupId}/settlements/${settlementId}/settle`);
      setMessage('Payment confirmed and balance updated! ✓');
      await loadData();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to update settlement');
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Balances & Settlements</h1>
          <p>Real-time net balance calculations and peer-to-peer settlement tracking for {group?.name || 'Group'}</p>
        </div>
        <div className="header-actions">
          <Link to={`/groups/${groupId}`} className="btn-secondary">
            ← Back to Group
          </Link>
        </div>
      </header>

      {error ? <div className="error-text">{error}</div> : null}
      {message ? <div className="success-text">{message}</div> : null}

      {/* ── Top Balance Summary Bar ── */}
      {userSummary && (
        <div className="summary-balance-bar">
          <div className="summary-balance-item">
            <span className="summary-balance-label">Your Settle-up Status</span>
            {userSummary.totalToPay > 0 ? (
              <>
                <span className="summary-balance-amount negative">You Owe ₹{userSummary.totalToPay.toFixed(2)}</span>
                <span className="summary-balance-subtext" style={{ color: 'var(--danger)', fontWeight: 500 }}>
                  {userSummary.debtsToPayCount} pending {userSummary.debtsToPayCount === 1 ? 'payment' : 'payments'} to settle
                </span>
              </>
            ) : userSummary.totalToReceive > 0 ? (
              <>
                <span className="summary-balance-amount positive">You are Owed ₹{userSummary.totalToReceive.toFixed(2)}</span>
                <span className="summary-balance-subtext" style={{ color: 'var(--success)', fontWeight: 500 }}>
                  Group members will pay you directly
                </span>
              </>
            ) : (
              <>
                <span className="summary-balance-amount neutral">All Settled Up</span>
                <span className="summary-balance-subtext">You have no outstanding debts in this group</span>
              </>
            )}
          </div>

          <div className="summary-balance-item">
            <span className="summary-balance-label">Active Settlements</span>
            <span className="summary-balance-amount neutral">{settlements.length}</span>
            <span className="summary-balance-subtext">Minimal pairwise transactions calculated</span>
          </div>
        </div>
      )}

      {/* ── Simplified Settle-up Action List ──────────────────────────── */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Pending Settle-up Payments ({settlements.length})</h2>
            <div className="card-subtitle">Minimal pairwise transactions calculated to resolve all group debts</div>
          </div>
        </div>

        {settlements.length === 0 ? (
          <p className="no-requests-text">
            No pending settlements. Everyone is completely settled.
          </p>
        ) : (
          <ul className="list">
            {settlements.map((settlement) => {
              const isMyDebt = currentUser?.id === settlement.from;
              const isMyCredit = currentUser?.id === settlement.to;
              const isCompleted = settlement.status === 'completed';

              return (
                <li key={settlement.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <strong>{isMyDebt ? 'You' : settlement.fromName}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
                    <strong>{isMyCredit ? 'You' : settlement.toName}</strong>
                  </div>

                  <div className="row-actions">
                    <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: '14px' }}>
                      ₹{Number(settlement.amount).toFixed(2)}
                    </strong>

                    {isCompleted ? (
                      <span className="impact-badge receive">Paid</span>
                    ) : isMyDebt ? (
                      <button
                        id={`mark-settled-${settlement.id}`}
                        className="btn-primary"
                        style={{ height: '30px', fontSize: '12px' }}
                        onClick={() => handleMarkSettled(settlement.id)}
                        title="Mark this debt as paid (either person can confirm)"
                      >
                        Mark as Paid
                      </button>
                    ) : isMyCredit ? (
                      <button
                        id={`confirm-received-${settlement.id}`}
                        className="btn-primary"
                        style={{ height: '30px', fontSize: '12px', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                        onClick={() => handleMarkSettled(settlement.id)}
                        title="Confirm you received this payment (either person can confirm)"
                      >
                        Confirm Received
                      </button>
                    ) : (
                      <span className="impact-badge settled">
                        Pending
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Mini Transaction List: Confirmed Settlements ─────────────── */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Confirmed Settlement History ({history.length})</h2>
            <div className="card-subtitle">Verified payment audit log</div>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="no-requests-text">
            No confirmed settlement transactions yet.
          </p>
        ) : (
          <ul className="list">
            {history.map((item) => {
              const isPayer = currentUser?.id === item.fromId;
              const isReceiver = currentUser?.id === item.toId;
              const isConfirmerMe = currentUser?.id === item.confirmedById;
              const confirmerName = isConfirmerMe ? 'You' : item.confirmedByName;
              const displayDate = item.confirmedAt || item.createdAt;
              const formattedDate = displayDate
                ? new Date(displayDate).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';

              return (
                <li key={item.id}>
                  <div>
                    <div style={{ fontSize: '13.5px' }}>
                      <strong>{isPayer ? 'You' : item.fromName}</strong>
                      <span style={{ color: 'var(--text-secondary)' }}> paid </span>
                      <strong>{isReceiver ? 'You' : item.toName}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                      {confirmerName && (
                        <span>
                          Confirmed by <strong>{confirmerName}</strong>
                        </span>
                      )}
                      {formattedDate && <span style={{ marginLeft: 6 }}>&bull; {formattedDate}</span>}
                    </div>
                  </div>

                  <div className="row-actions">
                    <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: '14px' }}>
                      ₹{Number(item.amount).toFixed(2)}
                    </strong>
                    <span className="impact-badge receive">
                      Confirmed
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Net Balances Breakdown ────────────────────────────────────── */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Member Net Balances</h2>
            <div className="card-subtitle">Total paid minus total consumed across all expenses & settlements</div>
          </div>
        </div>
        <ul className="list">
          {balances.map((balance) => {
            const net = Number(balance.netBalance);
            const isPositive = net > 0;
            const isNeutral = net === 0;
            const isCurrentUser = balance.userId === currentUser?.id;

            return (
              <li key={balance.userId}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <div className="group-avatar-mini">{balance.name.charAt(0).toUpperCase()}</div>
                  <strong style={{ fontSize: '13px' }}>{balance.name}</strong>
                  {isCurrentUser && <span className="you-pill">You</span>}
                </div>
                <span
                  style={{
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: isNeutral ? 'var(--text-muted)' : isPositive ? 'var(--success)' : 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-1)',
                  }}
                >
                  {isPositive ? '+' : ''}₹{net.toFixed(2)}
                  <small style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                    ({isNeutral ? 'settled' : isPositive ? 'gets back' : 'owes'})
                  </small>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
