import { DawControlImage } from './DawOriginalExample.web';
import { DawTrackExample } from './DawExample.web';
import { HomeTour } from './HomeTour.web';
function ButtonNotes({ items, columns = 1 }: { items: [string, string][]; columns?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 12,
        margin: '12px 0',
      }}
    >
      {items.map(([label, description]) => (
        <div key={label}>
          <DawControlImage
            label={label}
            fallback={
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 9px',
                  border: '1px solid #7d9988',
                  borderRadius: 5,
                  background: '#425f4c',
                  color: '#e1ece4',
                  fontSize: 12,
                  marginBottom: 5,
                }}
              >
                {label}
              </span>
            }
          />
          <div style={{ fontSize: 13, color: '#56657c', lineHeight: 1.65 }}>{description}</div>
        </div>
      ))}
    </div>
  );
}
const steps = [
  {
    title: 'DAW로 함께 연습해요',
    body: '개인이 연습한 부분이나 합주를 녹음해 팀원들과 공유하고 피드백을 해요.',
    target: '.studio-console',
  },
  {
    title: '원하는 구간부터 재생',
    body: '재생 버튼을 누르거나 타임라인을 눌러 재생 위치를 바꿔보세요.',
    target: '.studio-transport, .studio-ruler',
    placement: 'bottom' as const,
    scroll: false,
  },
  {
    title: '트랙 추가',
    width: 560,
    body: '원하는 트랙을 생성할 수 있어요.',
    target: '.studio-add-track-control',
    example: (
      <div>
        <p>
          <strong>오디오 트랙</strong> - 녹음하거나 녹음본을 올릴 때 사용해요.
        </p>
        <DawTrackExample />
        <p>
          <strong>미디 트랙</strong> - 가상악기 연주가 필요할 때 사용해요.
        </p>
        <DawTrackExample midi />
      </div>
    ),
  },
  {
    title: '녹음',
    width: 560,
    body: '상단 녹음 버튼을 누르면 녹음이 활성화된 오디오 트랙에 녹음을 진행해요.',
    target: '.studio-record',
    example: <DawTrackExample highlight="record" />,
  },
  {
    title: '트랙 설정',
    width: 560,
    body: '',
    target: '',
    example: (
      <>
        <DawTrackExample />
        <ButtonNotes
          items={[
            ['M', '이 트랙의 소리를 끄거나 다시 켜요.'],
            ['S', '이 트랙만 따로 들어요.'],
            ['볼륨 바', '이 트랙의 소리 크기를 조절해요.'],
            ['파일 추가', '내 기기의 오디오 파일을 트랙에 추가해요.'],
            ['클립 가져오기', '클립 보관함의 클립을 트랙에 추가해요.'],
          ]}
        />
      </>
    ),
  },
  {
    title: '미디 트랙 설정',
    width: 560,
    body: '',
    target: '',
    example: (
      <>
        <DawTrackExample midi highlight="instrument" />
        <ButtonNotes
          items={[
            ['악기 종류', '기타·베이스·건반·기타 악기·퍼커션 중에서 선택해요.'],
            ['가상악기', '선택한 악기 종류에서 사용할 소리를 골라요.'],
            ['+ 미디 클립', '음표를 입력할 빈 미디 클립을 추가해요.'],
          ]}
        />
      </>
    ),
  },
  {
    title: '미디 클립 편집',
    body: '미디 클립을 더블클릭하면 편집 창이 열려요. 음표를 추가하고 드래그해 음높이와 길이를 조절하세요.',
    target: '',
    wide: true,
    example: (
      <div className="daw-midi-help-layout">
        <figure style={{ margin: '12px 0' }}>
          <img
            src={new URL('../../assets/help/midi-clip-edit.png', import.meta.url).href}
            alt="미디 악보 편집 화면 예시"
            style={{ display: 'block', width: '100%', borderRadius: 8 }}
          />
          <figcaption style={{ marginTop: 6, fontSize: 11, color: '#7b8795' }}>
            예시 · 미디 클립 편집 화면
          </figcaption>
        </figure>
        <ButtonNotes
          items={[
            ['+ 음표 추가', '켜면 빈 칸을 클릭하거나 드래그해 음표를 그릴 수 있어요.'],
            ['음표 삭제', '선택한 음표를 삭제해요.'],
            ['음표 복사하기', '선택한 음표를 복사해요.'],
            ['음표 붙여넣기', '기준 칸을 선택한 뒤 복사한 음표를 붙여넣어요.'],
            ['클립 길이 (박)', '미디 클립의 전체 길이를 박 단위로 조절해요.'],
            ['클립에 적용', '편집한 내용을 DAW의 미디 클립에 반영해요.'],
            ['취소 / 닫기', '편집한 내용을 적용하지 않고 창을 닫아요.'],
          ]}
        />
      </div>
    ),
  },
  {
    title: '클립 이동 옵션',
    body: '',
    target: '.studio-move-options',
    scroll: false,
    placement: 'bottom' as const,
    example: (
      <ButtonNotes
        items={[
          ['커서 따라가기', '재생 커서가 화면 밖으로 나가면 화면이 따라가요.'],
          ['클립 붙이기', '가까운 클립의 시작·끝에 맞춰줘요.'],
          ['박자 맞춤', '클립과 커서의 위치를 박자에 맞춰줘요.'],
        ]}
      />
    ),
  },
  {
    title: '변경사항 공유',
    body: '변경사항 공유하기를 눌러 팀원들에게 연습한 내용을 공유하세요.',
    target: '.studio-share',
  },
];
export function DawHelp({
  onClose,
  onReady,
  onComplete,
}: {
  onClose: () => void;
  onReady?: () => void;
  onComplete?: () => void;
}) {
  return (
    <HomeTour
      onReady={onReady}
      onComplete={onComplete}
      hasBand
      bandHome={false}
      customSteps={steps}
      tourTitle="DAW 도움말"
      onClose={onClose}
      onStep={() => {}}
      onCreate={onClose}
      onJoin={onClose}
      onHelp={onClose}
    />
  );
}
