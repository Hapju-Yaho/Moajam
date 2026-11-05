import styledWeb from '@emotion/styled';
import { AppIcon } from '@component/shared/icons';

export function PracticeSectionTitle({ title }: { title: string }) {
  return (
    <PracticeSectionTitleContainer>
      <h2>{title}</h2>
      <StudioHelpButton
        type="button"
        className="studio-help-button"
        aria-label={`${title} 도움말`}
        title="도움말 준비 중"
        disabled
      >
        <AppIcon name="help" size={19} color="#8b9aad" />
      </StudioHelpButton>
    </PracticeSectionTitleContainer>
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

const PracticeSectionTitleContainer = styledWeb('div')({
  '&&&&': { display: 'flex', alignItems: 'center', gap: 8 },
});

const StudioHelpButton = styledWeb('button')({
  '&&&&': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    padding: 0,
    border: 0,
    background: 'transparent',
    color: '#8b9aad',
  },
});
