import { useState, useEffect } from 'react';
import { PREDEFINED_CATEGORIES } from '../lib/constants';

export default function CategoryPicker({ value, onChange, required = true, idPrefix = 'cat' }) {
  const isPredefined = PREDEFINED_CATEGORIES.some((c) => c.label.toLowerCase() === (value || '').toLowerCase());
  const [isCustomMode, setIsCustomMode] = useState(!isPredefined && !!value);
  const [customInput, setCustomInput] = useState(!isPredefined ? (value || '') : '');

  useEffect(() => {
    const isKnown = PREDEFINED_CATEGORIES.some((c) => c.label.toLowerCase() === (value || '').toLowerCase());
    if (value && !isKnown) {
      setIsCustomMode(true);
      setCustomInput(value);
    } else if (isKnown) {
      setIsCustomMode(false);
    }
  }, [value]);

  function handleSelectPredefined(categoryLabel) {
    setIsCustomMode(false);
    setCustomInput('');
    onChange(categoryLabel);
  }

  function handleToggleCustom() {
    setIsCustomMode(true);
    if (customInput.trim()) {
      onChange(customInput.trim());
    } else {
      onChange('');
    }
  }

  function handleCustomChange(e) {
    const newVal = e.target.value;
    setCustomInput(newVal);
    onChange(newVal);
  }

  return (
    <div className="category-picker-container" style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="category-chips-grid" style={{ gap: '6px', width: '100%', boxSizing: 'border-box' }}>
        {PREDEFINED_CATEGORIES.map((cat) => {
          const isSelected = !isCustomMode && value?.toLowerCase() === cat.label.toLowerCase();
          return (
            <button
              key={cat.label}
              type="button"
              id={`${idPrefix}-${cat.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              className={`category-chip ${isSelected ? 'active selected' : ''}`}
              onClick={() => handleSelectPredefined(cat.label)}
              style={{ padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
            >
              <span className="category-chip-icon">{cat.icon}</span>
              <span className="category-chip-label">{cat.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          id={`${idPrefix}-custom-toggle`}
          className={`category-chip ${isCustomMode ? 'active selected' : ''}`}
          onClick={handleToggleCustom}
          style={{ padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
        >
          <span className="category-chip-icon">✏️</span>
          <span className="category-chip-label">Custom</span>
        </button>
      </div>

      {isCustomMode && (
        <div className="custom-category-input-wrapper" style={{ marginTop: '8px', width: '100%' }}>
          <input
            type="text"
            id={`${idPrefix}-custom-input`}
            className="custom-category-input"
            placeholder="Type custom category (e.g. Gym, Pet Care, Tuition, Gifts)..."
            value={customInput}
            onChange={handleCustomChange}
            autoFocus
            required={required}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '13px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  );
}
