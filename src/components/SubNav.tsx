interface Item<T extends string> {
  id: T;
  label: string;
  icon?: string;
  /** Shown as a small count after the label. */
  count?: number;
  disabled?: boolean;
}

interface Props<T extends string> {
  items: Item<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}

// Segmented switch between the views of one section.
export default function SubNav<T extends string>({ items, value, onChange, label }: Props<T>) {
  return (
    <div className="subnav" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          className={`subnav-item${value === it.id ? ' active' : ''}`}
          disabled={it.disabled}
          onClick={() => onChange(it.id)}
        >
          {it.icon && <span aria-hidden>{it.icon}</span>}
          {it.label}
          {it.count !== undefined && <span className="subnav-count">{it.count.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}
