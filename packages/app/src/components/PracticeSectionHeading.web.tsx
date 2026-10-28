import { AppIcon } from './icons';

export function PracticeSectionTitle({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <h2>{title}</h2>
      <button
        type="button"
        className="studio-help-button"
        aria-label={`${title} 도움말`}
        title="도움말 준비 중"
        disabled
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: '#8b9aad',
        }}
      >
        <AppIcon name="help" size={19} color="#8b9aad" />
      </button>
    </div>
  );
}
export function PracticeSectionHeading({ title }: { title: string }) {
  return (
    <header className="studio-heading">
      <div className="studio-heading-info">
        <PracticeSectionTitle title={title} />
      </div>
    </header>
  );
}
