import { useRef, useState } from 'react';
import { HomeTour } from './HomeTour.web';
import { DawHelp } from './DawHelp.web';
export function PracticeHelp({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete?: () => void;
}) {
  const [daw, setDaw] = useState(false);
  const [dawReady, setDawReady] = useState(false);
  const scrollPosition = useRef<{ element: Element; top: number; left: number }[]>([]);
  const [resumeStep, setResumeStep] = useState(0);
  const steps = [
    {
      title: '함께 연습을 시작해요',
      body: '악보를 확인하고, 연주를 녹음해 팀원들과 공유해보세요.',
      target: '',
    },
    {
      title: '연습할 곡 선택',
      body: '곡을 선택하면 해당 곡의 악보와 트랙이 열려요.',
      target: 'practice-song-list',
    },
    {
      title: 'PDF 악보 보기',
      body: '세션별 PDF 악보를 등록하고 새 창에서 열어보세요.',
      target: 'practice-pdf-open',
    },
    {
      title: '밴드 악보 편집',
      body: '음표를 입력하고 편집할 수 있는 밴드 악보를 열어요.',
      target: 'practice-score-edit',
    },
    {
      title: '녹음으로 연습 현황 공유',
      body: '개인이 연습한 부분이나 합주를 녹음해 팀원들과 공유하고 피드백을 해요.',
      target: '.studio-console',
      actionLabel: 'DAW 기능 자세히 보기 →',
      action: () => {
        const positions = [];
        let element = document.querySelector('.studio-console');
        while (element) {
          positions.push({ element, top: element.scrollTop, left: element.scrollLeft });
          element = element.parentElement;
        }
        scrollPosition.current = positions;
        setDawReady(false);
        setDaw(true);
      },
    },
    {
      title: '구간별 의견 남기기',
      body: '재생 위치를 정하고 해당 구간에 대한 의견을 남겨보세요.',
      target: 'practice-feedback',
    },
    {
      title: '다시 보고 싶을 때',
      body: '물음표 버튼에서 연습실 안내를 다시 볼 수 있어요.',
      target: 'tour-help',
    },
  ];
  return (
    <>
      {!dawReady && (
        <HomeTour
          initialStep={resumeStep}
          hasBand
          bandHome={false}
          customSteps={steps}
          tourTitle="연습실 도움말"
          onStep={() => {}}
          onClose={onClose}
          onComplete={onComplete}
          onHelp={onClose}
          onCreate={onClose}
          onJoin={onClose}
        />
      )}
      {daw && (
        <DawHelp
          onReady={() => {
            const positions = scrollPosition.current;
            const restore = () =>
              positions.forEach(({ element, top, left }) => {
                element.scrollTop = top;
                element.scrollLeft = left;
              });
            restore();
            setDawReady(true);
            requestAnimationFrame(restore);
          }}
          onClose={() => {
            setResumeStep(steps.findIndex((step) => step.target === '.studio-console'));
            setDaw(false);
            setDawReady(false);
          }}
          onComplete={() => {
            setResumeStep(steps.findIndex((step) => step.target === '.studio-console'));
            setDaw(false);
            setDawReady(false);
          }}
        />
      )}
    </>
  );
}
