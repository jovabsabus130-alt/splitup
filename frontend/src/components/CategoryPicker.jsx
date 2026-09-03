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
    <div className="category-picker-container">
      <div className="category-chips-grid">
        {PREDEFINED_CATEGORIES.map((cat) => {
          const isSelected = !isCustomMode && value?.toLowerCase() === cat.label.toLowerCase();
          return (
            <button
              key={cat.label}
              type="button"
              id={`${idPrefix}-${cat.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              className={`category-chip ${isSelected ? 'selected' : ''}`}
              onClick={() => handleSelectPredefined(cat.label)}
            >
              <span className="category-chip-icon">{cat.icon}</span>
              <span className="category-chip-label">{cat.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          id={`${idPrefix}-custom-toggle`}
          className={`category-chip ${isCustomMode ? 'selected' : ''}`}
          onClick={handleToggleCustom}
        >
          <span className="category-chip-icon">✏️</span>
          <span className="category-chip-label">Custom</span>
        </button>
      </div>

      {isCustomMode && (
        <div className="custom-category-input-wrapper">
          <input
            type="text"
            id={`${idPrefix}-custom-input`}
            className="custom-category-input"
            placeholder="Type custom category (e.g. Gym, Pet Care, Tuition)..."
            value={customInput}
            onChange={handleCustomChange}
            autoFocus
            required={required}
          />
        </div>
      )}
    </div>
  );
}
