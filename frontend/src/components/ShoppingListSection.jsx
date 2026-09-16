import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { PREDEFINED_CATEGORIES } from '../lib/constants';

function getCategoryIcon(cat) {
  const found = PREDEFINED_CATEGORIES.find(
    (item) => item.label.toLowerCase() === (cat || '').toLowerCase()
  );
  return found ? found.icon : '🛍️';
}

export default function ShoppingListSection({ groupId, members, currentUserId, onExpenseCreated }) {
  const [items, setItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemCategory, setNewItemCategory] = useState('Shopping');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [splitOpenId, setSplitOpenId] = useState(null); // itemId with split panel open

  // Per-item split state: { [itemId]: { paidById, category, shares: {[userId]: string}, excluded: {[userId]: bool} } }
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
      const body = {
        name: newItemName.trim(),
        quantity: Math.max(1, parseInt(newItemQuantity, 10) || 1),
        category: newItemCategory || 'Shopping',
      };
      if (newItemPrice) body.price = Number(newItemPrice);
      const { data } = await api.post(`/api/groups/${groupId}/shopping`, body);
      setItems((prev) => [...prev, data.item]);
      setNewItemName('');
      setNewItemPrice('');
      setNewItemQuantity(1);
      setNewItemCategory('Shopping');
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

  async function handleUpdateItem(item, updates) {
    try {
      const { data } = await api.patch(`/api/groups/${groupId}/shopping/${item.id}`, updates);
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update item');
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

  // Open split panel for an item — initialise even shares among all members with buyer absorbing rounding difference
  function openSplitPanel(item) {
    if (splitOpenId === item.id) { setSplitOpenId(null); return; }
    setSplitOpenId(item.id);
    const price = Number(item.price) || 0;
    const buyerId = currentUserId || members[0]?.id || '';
    const itemCategory = item.category || 'Shopping';
    const totalCents = Math.round(price * 100);
    const count = members.length;
    const baseCents = count ? Math.floor(totalCents / count) : 0;
    const remainderCents = count ? totalCents - baseCents * count : 0;

    const shares = {};
    const excluded = {};
    for (const m of members) {
      const cents = baseCents + (m.id === buyerId ? remainderCents : 0);
      shares[m.id] = (cents / 100).toFixed(2);
    }
    setSplitState((prev) => ({
      ...prev,
      [item.id]: { paidById: buyerId, category: itemCategory, shares, excluded },
    }));
  }

  async function handleSplitSubmit(item) {
    const state = splitState[item.id];
    if (!state) return;

    const itemPrice = Number(item.price) || 0;
    const buyerId = state.paidById || currentUserId || members[0]?.id;
    const category = state.category || item.category || 'Shopping';

    let splits = members
      .filter((m) => !state.excluded[m.id])
      .map((m) => ({ userId: m.id, share: Number(state.shares[m.id]) || 0 }))
      .filter((s) => s.share > 0);

    const totalSplit = splits.reduce((sum, s) => sum + s.share, 0);
    const diff = Number((itemPrice - totalSplit).toFixed(2));

    // Absorb rounding difference (<= ₹0.01) into buyer's share
    if (Math.abs(diff) <= 0.01 && diff !== 0) {
      const buyerSplit = splits.find((s) => s.userId === buyerId);
      if (buyerSplit) {
        buyerSplit.share = Number((buyerSplit.share + diff).toFixed(2));
      } else if (splits.length > 0) {
        splits[0].share = Number((splits[0].share + diff).toFixed(2));
      }
    }

    setError('');
    try {
      await api.post(`/api/groups/${groupId}/shopping/${item.id}/expense`, {
        paidById: buyerId,
        category,
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
          <div className="card-subtitle">Shared checklist of group items with quantities, categories and one-click expense conversion</div>
        </div>
      </div>

      {/* ── Add Item Form ─────────────────────────────── */}
      <form onSubmit={handleAddItem} style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Item name (e.g. Milk, Bread)"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          style={{ flex: '2 1 160px', minWidth: '150px' }}
          required
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: '0 1 90px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Qty:</span>
          <input
            type="number"
            min="1"
            step="1"
            placeholder="1"
            value={newItemQuantity}
            onChange={(e) => setNewItemQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            style={{ width: '55px', height: '36px', padding: '4px 6px', textAlign: 'center' }}
            title="Quantity"
          />
        </div>
        <select
          value={newItemCategory}
          onChange={(e) => setNewItemCategory(e.target.value)}
          style={{ flex: '1 1 130px', minWidth: '120px', height: '36px' }}
          title="Category"
        >
          {PREDEFINED_CATEGORIES.map((cat) => (
            <option key={cat.label} value={cat.label}>
              {cat.icon} {cat.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="Price (optional)"
          value={newItemPrice}
          onChange={(e) => setNewItemPrice(e.target.value)}
          style={{ flex: '1 1 110px', minWidth: '100px' }}
        />
        <button type="submit" disabled={adding || !newItemName.trim()} className="btn-primary" style={{ height: '36px' }}>
          {adding ? 'Adding…' : 'Add Item'}
        </button>
      </form>

      {error ? <div className="error-text" style={{ marginTop: 'var(--space-2)' }}>{error}</div> : null}

      {/* ── Pending Items ─────────────────────────────── */}
      {pending.length === 0 && done.length === 0 && (
        <p className="no-requests-text" style={{ marginTop: 'var(--space-3)' }}>No items yet. Add something above.</p>
      )}

      {pending.length > 0 && (
        <ul className="list" style={{ marginTop: 'var(--space-3)' }}>
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
              onUpdate={handleUpdateItem}
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
        <div style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Completed ({done.length})
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
                onUpdate={handleUpdateItem}
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
  onToggle, onUpdate, onDelete, onOpenSplit, onSplitSubmit, onCloseSplit,
}) {
  const isSplitOpen = splitOpenId === item.id;
  const state = splitState[item.id] || {};
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name || '');
  const [editQty, setEditQty] = useState(item.quantity || 1);
  const [editCat, setEditCat] = useState(item.category || 'Shopping');
  const [localPrice, setLocalPrice] = useState(item.price ? String(Number(item.price)) : '');

  // Keep localPrice in sync if item changes externally
  useEffect(() => {
    setLocalPrice(item.price ? String(Number(item.price)) : '');
  }, [item.price]);

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

  async function handleSaveEdit() {
    if (!editName.trim()) return;
    await onUpdate(item, {
      name: editName.trim(),
      quantity: Math.max(1, parseInt(editQty, 10) || 1),
      category: editCat || 'Shopping',
      price: localPrice ? Number(localPrice) : null,
    });
    setIsEditing(false);
  }

  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {/* ── Left info: Checkbox, Name, Quantity badge, Category tag, Added By ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', flex: 1 }}>
          <input
            type="checkbox"
            className="split-checkbox"
            checked={item.completed}
            onChange={() => onToggle(item)}
            title="Mark as bought"
          />

          {isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ height: '30px', fontSize: '13px', width: '140px' }}
                placeholder="Item name"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Qty:</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editQty}
                  onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{ width: '45px', height: '30px', fontSize: '12px', textAlign: 'center', padding: '2px 4px' }}
                />
              </div>
              <select
                value={editCat}
                onChange={(e) => setEditCat(e.target.value)}
                style={{ height: '30px', fontSize: '12px', width: '120px' }}
              >
                {PREDEFINED_CATEGORIES.map((cat) => (
                  <option key={cat.label} value={cat.label}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <span
                style={{
                  textDecoration: item.completed ? 'line-through' : 'none',
                  color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                  fontWeight: 500,
                  fontSize: '14px',
                }}
              >
                {item.name}
              </span>

              {/* Quantity badge */}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '12px',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
                title={`Quantity: ${item.quantity || 1}`}
              >
                {item.quantity || 1}×
              </span>

              {/* Category tag */}
              <span className="category-tag" title={`Category: ${item.category || 'Shopping'}`}>
                <span style={{ marginRight: '4px' }}>{getCategoryIcon(item.category || 'Shopping')}</span>
                <span>{item.category || 'Shopping'}</span>
              </span>

              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                by {item.addedBy?.name || 'Member'}
              </span>
            </>
          )}
        </div>

        {/* ── Right actions: Price, Split, Edit/Save, Delete ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {isEditing ? (
            <>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                style={{ width: '75px', height: '30px', padding: '2px 6px', fontSize: '12px', textAlign: 'right' }}
                value={localPrice}
                onChange={(e) => setLocalPrice(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                style={{ height: '30px', fontSize: '12px', padding: '0 8px' }}
                onClick={handleSaveEdit}
              >
                Save
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ height: '30px', fontSize: '12px', padding: '0 6px' }}
                onClick={() => {
                  setEditName(item.name || '');
                  setEditQty(item.quantity || 1);
                  setEditCat(item.category || 'Shopping');
                  setLocalPrice(item.price ? String(Number(item.price)) : '');
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                style={{ width: '80px', height: '32px', padding: '4px 8px', fontSize: '13px', textAlign: 'right' }}
                value={localPrice}
                onChange={(e) => setLocalPrice(e.target.value)}
                onBlur={() => {
                  if (localPrice !== String(Number(item.price) || '')) {
                    onUpdate(item, { price: localPrice ? Number(localPrice) : null });
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

              <button
                type="button"
                className="btn-ghost"
                style={{ height: '32px', padding: '0 6px', color: 'var(--text-muted)', fontSize: '12px' }}
                onClick={() => {
                  setEditName(item.name || '');
                  setEditQty(item.quantity || 1);
                  setEditCat(item.category || 'Shopping');
                  setIsEditing(true);
                }}
                title="Edit item"
              >
                ✏️
              </button>

              <button
                className="btn-ghost"
                style={{ height: '32px', padding: '0 6px', color: 'var(--text-muted)' }}
                onClick={() => onDelete(item.id)}
                title="Remove item"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Inline split / review & convert panel ── */}
      {isSplitOpen && (
        <div style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-2)' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                Review & Confirm Expense Conversion
              </span>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Carried over: <strong>{item.name}</strong> ({item.quantity || 1}×) &bull; ₹{totalAmount.toFixed(2)}
              </div>
            </div>
            <span className="category-tag">
              {getCategoryIcon(state.category || item.category || 'Shopping')} {state.category || item.category || 'Shopping'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>Remaining to split:</span>
            <strong style={{ color: remaining < 0 ? 'var(--danger)' : remaining === 0 ? 'var(--success)' : 'inherit', fontVariantNumeric: 'tabular-nums' }}>
              ₹{remaining.toFixed(2)}
            </strong>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '13px', flex: 1 }}>
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

            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '13px', flex: 1 }}>
              Category:
              <select
                style={{ width: 'auto', flex: 1 }}
                value={state.category || item.category || 'Shopping'}
                onChange={(e) =>
                  setSplitState((prev) => ({ ...prev, [item.id]: { ...prev[item.id], category: e.target.value } }))
                }
              >
                {PREDEFINED_CATEGORIES.map((cat) => (
                  <option key={cat.label} value={cat.label}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
              Confirm & Add Expense
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

