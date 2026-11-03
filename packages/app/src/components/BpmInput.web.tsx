import { useEffect, useState } from 'react';

export function BpmInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    const next = draft.trim() && Number.isFinite(parsed) ? Math.max(20, Math.min(300, parsed)) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return <input type="number" min={20} max={300} value={draft}
    onChange={(event) => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.blur();
      }
    }} />;
}
