import { useEffect, useState } from 'react';
import api from '../lib/api';
import AIExpenseAnalysisModal from './AIExpenseAnalysisModal';

export default function AIFloatingButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('insights'); // 'insights' | 'parse'
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [parseText, setParseText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadUserGroups() {
      try {
        const { data } = await api.get('/api/groups');
        const userGroups = data.groups || [];
        setGroups(userGroups);
        if (userGroups.length > 0 && !selectedGroupId) {
          setSelectedGroupId(userGroups[0].id);
        }
      } catch {}
    }
    if (isOpen) {
      loadUserGroups();
    }
  }, [isOpen]);

  async function handleParse() {
    if (!parseText.trim() || !selectedGroupId) return;
    setIsParsing(true);
    setError('');
    setSuccess('');
    setParseResult(null);

    try {
      const { data } = await api.post(`/api/groups/${selectedGroupId}/expenses/parse`, { text: parseText.trim() });
      setParseResult(data.parsed);
      setSuccess('✨ Successfully parsed expense details!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to parse text with AI');
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSaveParsedExpense() {
    if (!parseResult || !selectedGroupId) return;
    setSubmitting(true);
    setError('');

    try {
      // Fetch group members to build split payload
      const groupRes = await api.get(`/api/groups/${selectedGroupId}`);
      const groupData = groupRes.data.group;
      const members = groupData?.members?.map((m) => m.user) || [];

      // Calculate splits
      let splits = [];
      if (parseResult.splitSuggestion && parseResult.splitSuggestion.length > 0) {
        const validSplits = parseResult.splitSuggestion.filter((s) => !s.excluded && s.share > 0);
        splits = validSplits.map((s) => {
          const match = members.find((m) =>
            m.name.toLowerCase().includes(s.label.toLowerCase()) ||
            s.label.toLowerCase().includes(m.name.toLowerCase())
          );
          return {
            userId: match ? match.id : members[0]?.id,
            share: Number(s.share),
          };
        });
      }

      if (splits.length === 0 && members.length > 0) {
        const sharePerMember = Number((parseResult.amount / members.length).toFixed(2));
        splits = members.map((m) => ({ userId: m.id, share: sharePerMember }));
      }

      await api.post(`/api/groups/${selectedGroupId}/expenses`, {
        amount: Number(parseResult.amount),
        category: parseResult.category || 'Other',
        description: parseResult.description || parseText,
        splits,
      });

      setSuccess('Expense saved to group successfully! 🎉');
      setParseText('');
      setParseResult(null);
      setTimeout(() => {
        setIsOpen(false);
        window.location.reload();
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save parsed expense');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* ── Floating AI Trigger Button ── */}
      <div className="ai-floating-container">
        <button
          type="button"
          id="ai-floating-trigger-btn"
          className="ai-floating-btn"
          onClick={() => setIsOpen(true)}
          title="Open AI Expense Assistant & Spending Insights"
          aria-label="Open AI Assistant"
        >
          <span className="ai-floating-icon">✨</span>
          <span className="ai-floating-label">AI Assistant</span>
        </button>
      </div>

      {/* ── AI Modal / Drawer ── */}
      {isOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-box ai-assistant-modal-box" style={{ maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }}>
            <button
              className="modal-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close AI Assistant"
            >
              ✕
            </button>

            {/* ── Header ── */}
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '16px',
                    boxShadow: '0 2px 8px rgba(147, 51, 234, 0.25)',
                  }}
                >
                  ✨
                </div>
                <div>
                  <h2 className="card-title">SplitUp AI Copilot</h2>
                  <div className="card-subtitle">
                    Intelligent expense parsing and monthly spending patterns
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="ai-modal-tabs" style={{ display: 'flex', gap: '8px', marginTop: 'var(--space-3)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-2)' }}>
              <button
                type="button"
                className={`btn-ghost ${activeTab === 'insights' ? 'active' : ''}`}
                style={{
                  fontWeight: activeTab === 'insights' ? 600 : 400,
                  borderBottom: activeTab === 'insights' ? '2px solid var(--accent-primary)' : 'none',
                  borderRadius: 0,
                  padding: '6px 14px',
                }}
                onClick={() => setActiveTab('insights')}
              >
                📊 Monthly Spending Analysis
              </button>
              <button
                type="button"
                className={`btn-ghost ${activeTab === 'parse' ? 'active' : ''}`}
                style={{
                  fontWeight: activeTab === 'parse' ? 600 : 400,
                  borderBottom: activeTab === 'parse' ? '2px solid var(--accent-primary)' : 'none',
                  borderRadius: 0,
                  padding: '6px 14px',
                }}
                onClick={() => setActiveTab('parse')}
              >
                💬 Natural Language Quick Add
              </button>
            </div>

            {/* ── Tab Content ── */}
            {activeTab === 'insights' ? (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <AIExpenseAnalysisModal
                  defaultGroupId={selectedGroupId}
                  onClose={() => setIsOpen(false)}
                />
              </div>
            ) : (
              /* ── Natural Language Parse Tab ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                <div style={{ background: 'var(--bg-subtle)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  💡 Type naturally in plain English: e.g. <em>"Paid ₹1,500 for grocery and snacks, split equally with Alex and Rahul"</em>
                </div>

                {groups.length > 0 && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                    Target Group
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      style={{ height: '36px' }}
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                  Expense Description
                  <textarea
                    rows="3"
                    value={parseText}
                    onChange={(e) => setParseText(e.target.value)}
                    placeholder="e.g. Paid 1200 for Dinner split with Jovab and Anu, exclude Rahul..."
                    style={{ resize: 'vertical' }}
                  />
                </label>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleParse}
                    disabled={isParsing || !parseText.trim() || !selectedGroupId}
                  >
                    {isParsing ? 'Parsing with AI…' : '✨ Parse Expense'}
                  </button>
                </div>

                {error && <div className="error-text">{error}</div>}
                {success && <div className="success-text">{success}</div>}

                {parseResult && (
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-4)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                        Parsed Amount: ₹{Number(parseResult.amount).toFixed(2)}
                      </strong>
                      <span className="category-tag">{parseResult.category}</span>
                    </div>

                    {parseResult.description && (
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Description: {parseResult.description}
                      </p>
                    )}

                    {parseResult.breakdownExplanation && (
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', background: 'var(--bg-subtle)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                        {parseResult.breakdownExplanation}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--space-2)' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSaveParsedExpense}
                        disabled={submitting}
                      >
                        {submitting ? 'Saving…' : 'Confirm & Save Expense'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
