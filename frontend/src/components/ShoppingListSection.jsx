import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';

export default function ShoppingListSection({ groupId, members, currentUserId, onExpenseCreated }) {
  const [items, setItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [splitOpenId, setSplitOpenId] = useState(null); // itemId with split panel open

  // Per-item split state: { [itemId]: { paidById, shares: {[userId]: string}, excluded: {[userId]: bool} } }
  const [splitState, setSplitState] = useState({});

  async function loadItems() {
    try {
      const { data } = await api.get(`/api/groups/${groupId}/shopping`);
      setItems(data.items || []);
    } catch {
      // silently ignore
    }
  }

  useEffect(() => { loadItems(); }, [groupId]);

  async function handleAddItem(e) {
    e.preventDefault();
    if (!newItemName.trim()) return;
    setAdding(true);
    setError('');
    try {
      const body = { name: newItemName.trim() };
      if (newItemPrice) body.price = Number(newItemPrice);
      const { data } = await api.post(`/api/groups/${groupId}/shopping`, body);
      setItems((prev) => [...prev, data.item]);
      setNewItemName('');
      setNewItemPrice('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add item');
    } finally {
      setAdding(false);
    }
  }

  async function toggleComplete(item) {
    try {
      const { data } = await api.patch(`/api/groups/${groupId}/shopping/${item.id}`, {
        completed: !item.completed,
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)));
    } catch {
      // ignore
    }
  }

  async function handleUpdatePrice(item, price) {
    try {
      const { data } = await api.patch(`/api/groups/${groupId}/shopping/${item.id}`, {
        price: price ? Number(price) : null,
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)));
    } catch {
      // ignore
    }
  }

  async function handleDeleteItem(itemId) {
    try {
      await api.delete(`/api/groups/${groupId}/shopping/${itemId}`);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      if (splitOpenId === itemId) setSplitOpenId(null);
    } catch {
      // ignore
    }
  }

  // Open split panel for an item — initialise even shares among all members
  function openSplitPanel(item) {
    if (splitOpenId === item.id) { setSplitOpenId(null); return; }
    setSplitOpenId(item.id);
    const price = Number(item.price) || 0;
    const evenShare = members.length ? (price / members.length).toFixed(2) : '0.00';
    const shares = {};
    const excluded = {};
    for (const m of members) shares[m.id] = evenShare;
    setSplitState((prev) => ({
      ...prev,
      [item.id]: { paidById: currentUserId || members[0]?.id || '', shares, excluded },
    }));
  }

  async function handleSplitSubmit(item) {
    const state = splitState[item.id];
    if (!state) return;

    const splits = members
      .filter((m) => !state.excluded[m.id])
      .map((m) => ({ userId: m.id, share: Number(state.shares[m.id]) || 0 }))
      .filter((s) => s.share > 0);

    setError('');
    try {
      await api.post(`/api/groups/${groupId}/shopping/${item.id}/expense`, {
        paidById: state.paidById,
        splits,
      });
      setSplitOpenId(null);
      await loadItems();
      if (onExpenseCreated) onExpenseCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create expense');
    }
  }

  const pending = useMemo(() => items.filter((i) => !i.completed), [items]);
  const done = useMemo(() => items.filter((i) => i.completed), [items]);

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Group Shopping List</h2>
          <div className="card-subtitle">Shared checklist of group items and direct one-click expense conversion</div>
        </div>
      </div>

      {/* ── Add Item Form ─────────────────────────────── */}
      <form onSubmit={handleAddItem} style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="e.g. Milk, Eggs, Bread"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          style={{ flex: 2, minWidth: '180px' }}
        />
        <input
          type="number"
          step="0.01"
          placeholder="₹ Price (optional)"
          value={newItemPrice}
          onChange={(e) => setNewItemPrice(e.target.value)}
          style={{ flex: 1, minWidth: '120px' }}
        />
        <button type="submit" disabled={adding || !newItemName.trim()} className="btn-primary">
          {adding ? 'Adding…' : 'Add Item'}
        </button>
      </form>

      {error ? <div className="error-text">{error}</div> : null}

      {/* ── Pending Items ─────────────────────────────── */}
      {pending.length === 0 && done.length === 0 && (
        <p className="no-requests-text">No items yet. Add something above.</p>
      )}

      {pending.length > 0 && (
        <ul className="list">
          {pending.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              members={members}
              currentUserId={currentUserId}
              splitOpenId={splitOpenId}
              splitState={splitState}
              setSplitState={setSplitState}
              onToggle={toggleComplete}
              onPriceChange={handleUpdatePrice}
              onDelete={handleDeleteItem}
              onOpenSplit={openSplitPanel}
              onSplitSubmit={handleSplitSubmit}
              onCloseSplit={() => setSplitOpenId(null)}
            />
          ))}
        </ul>
      )}

      {/* ── Completed Items ───────────────────────────── */}
      {done.length > 0 && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Completed
          </div>
          <ul className="list">
            {done.map((item) => (
              <ShoppingItemRow
                key={item.id}
                item={item}
                members={members}
                currentUserId={currentUserId}
                splitOpenId={splitOpenId}
                splitState={splitState}
                setSplitState={setSplitState}
                onToggle={toggleComplete}
                onPriceChange={handleUpdatePrice}
                onDelete={handleDeleteItem}
                onOpenSplit={openSplitPanel}
                onSplitSubmit={handleSplitSubmit}
                onCloseSplit={() => setSplitOpenId(null)}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── Sub-component: individual item row ──────────────────────────────────────

function ShoppingItemRow({
  item, members, currentUserId,
  splitOpenId, splitState, setSplitState,
  onToggle, onPriceChange, onDelete, onOpenSplit, onSplitSubmit, onCloseSplit,
}) {
  const isSplitOpen = splitOpenId === item.id;
  const state = splitState[item.id] || {};
  const [localPrice, setLocalPrice] = useState(item.price ? String(Number(item.price)) : '');

  const totalAmount = Number(item.price) || 0;
  const allocated = members
    .filter((m) => !state.excluded?.[m.id])
    .reduce((s, m) => s + (Number(state.shares?.[m.id]) || 0), 0);
  const remaining = totalAmount - allocated;

  function setShare(userId, value) {
    setSplitState((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], shares: { ...prev[item.id]?.shares, [userId]: value } },
    }));
  }

  function toggleExclude(userId) {
    const nowExcluded = !state.excluded?.[userId];
    setSplitState((prev) => {
      const next = { ...prev[item.id] };
      next.excluded = { ...next.excluded, [userId]: nowExcluded };
      const included = members.filter((m) => !next.excluded[m.id]);
      const price = totalAmount;
      const evenShare = included.length ? (price / included.length).toFixed(2) : '0.00';
      next.shares = {};
      for (const m of members) {
        next.shares[m.id] = next.excluded[m.id] ? '0.00' : evenShare;
      }
      return { ...prev, [item.id]: next };
    });
  }

  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input
            type="checkbox"
            className="split-checkbox"
            checked={item.completed}
            onChange={() => onToggle(item)}
            title="Mark as bought"
          />
          <span style={{ textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 500 }}>
            {item.name}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>by {item.addedBy?.name}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input
            type="number"
            step="0.01"
            placeholder="₹ Price"
            style={{ width: '80px', height: '32px', padding: '4px 8px', fontSize: '13px', textAlign: 'right' }}
            value={localPrice}
            onChange={(e) => setLocalPrice(e.target.value)}
            onBlur={() => {
              if (localPrice !== String(Number(item.price) || '')) {
                onPriceChange(item, localPrice);
              }
            }}
          />

          {!item.completed && (
            <button
              className="btn-secondary"
              style={{ height: '32px', fontSize: '12px' }}
              onClick={() => onOpenSplit(item)}
              title={item.price ? 'Split as expense' : 'Set a price first'}
              disabled={!item.price && !localPrice}
            >
              Split
            </button>
          )}

          <button className="btn-ghost" style={{ height: '32px', padding: '0 6px', color: 'var(--text-muted)' }} onClick={() => onDelete(item.id)} title="Remove item">
            ✕
          </button>
        </div>
      </div>

      {/* ── Inline split panel ── */}
      {isSplitOpen && (
        <div style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Remaining to split:</span>
            <strong style={{ color: remaining < 0 ? 'var(--danger)' : remaining === 0 ? 'var(--success)' : 'inherit', fontVariantNumeric: 'tabular-nums' }}>
              ₹{remaining.toFixed(2)}
            </strong>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '13px' }}>
            Paid by:
            <select
              style={{ width: 'auto', flex: 1 }}
              value={state.paidById || ''}
              onChange={(e) =>
                setSplitState((prev) => ({ ...prev, [item.id]: { ...prev[item.id], paidById: e.target.value } }))
              }
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.id === currentUserId ? ' (You)' : ''}</option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
            {members.map((m) => {
              const isExcluded = !!state.excluded?.[m.id];
              const includedCount = members.filter((mb) => !state.excluded?.[mb.id]).length;
              const isLastIncluded = !isExcluded && includedCount === 1;
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      className="split-checkbox"
                      checked={!isExcluded}
                      disabled={isLastIncluded}
                      onChange={() => toggleExclude(m.id)}
                    />
                    <span>{m.name}</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    style={{ width: '80px', height: '28px', padding: '2px 6px', fontSize: '12px', textAlign: 'right' }}
                    value={isExcluded ? '' : (state.shares?.[m.id] || '0')}
                    disabled={isExcluded}
                    placeholder={isExcluded ? 'Excluded' : ''}
                    onChange={(e) => setShare(m.id, e.target.value)}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <button className="btn-secondary" style={{ height: '32px', fontSize: '12px' }} onClick={onCloseSplit}>Cancel</button>
            <button className="btn-primary" style={{ height: '32px', fontSize: '12px' }} onClick={() => onSplitSubmit(item)}>
              Add as Expense
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
