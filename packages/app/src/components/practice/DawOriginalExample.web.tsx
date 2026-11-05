import styledWeb from '@emotion/styled';
import type { ReactNode } from 'react';
import audio from '@assets/help/audio-track.png?url';
import midi from '@assets/help/midi-track.png?url';
import toolbar from '@assets/help/clip-toolbar.png?url';
type Crop = {
  midi?: boolean;
  toolbar?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};
const controls: Record<string, Crop> = {
  M: { x: 37, y: 61, width: 21, height: 24 },
  S: { x: 62, y: 61, width: 22, height: 24 },
  '볼륨 바': { x: 89, y: 61, width: 113, height: 24 },
  '파일 추가': { x: 47, y: 88, width: 68, height: 23 },
  '클립 가져오기': { x: 117, y: 88, width: 73, height: 23 },
  '악기 종류': { midi: true, x: 7, y: 35, width: 97, height: 28 },
  가상악기: { midi: true, x: 105, y: 35, width: 99, height: 28 },
  '+ 미디 클립': { midi: true, x: 7, y: 91, width: 77, height: 23 },
  '클립 이름': { toolbar: true, x: 13, y: 8, width: 85, height: 29 },
  '커서에서 자르기': { toolbar: true, x: 108, y: 8, width: 108, height: 29 },
  '클립 삭제': { toolbar: true, x: 226, y: 8, width: 64, height: 29 },
  '클립 복사하기': { toolbar: true, x: 300, y: 8, width: 84, height: 29 },
  '클립 붙여넣기': { toolbar: true, x: 394, y: 8, width: 83, height: 29 },
  시작: { toolbar: true, x: 487, y: 8, width: 107, height: 29 },
  '클립 보관하기': { toolbar: true, x: 604, y: 8, width: 83, height: 29 },
};
function SourceCrop({ crop, label }: { crop: Crop; label: string }) {
  return (
    <SourceCropIcon
      role="img"
      aria-label={label}
      viewBox={[crop.x, crop.y, crop.width, crop.height].join(' ')}
      width={crop.width}
      height={crop.height}
    >
      <image
        href={crop.toolbar ? toolbar : crop.midi ? midi : audio}
        width={crop.toolbar ? 755 : crop.midi ? 542 : 497}
        height={crop.toolbar ? 45 : crop.midi ? 150 : 122}
      />
    </SourceCropIcon>
  );
}
export function DawControlImage({ label, fallback }: { label: string; fallback?: ReactNode }) {
  const crop = controls[label];
  return crop ? <SourceCrop crop={crop} label={label} /> : fallback;
}
export function DawTrackExample({
  midi: isMidi = false,
  highlight,
}: {
  midi?: boolean;
  highlight?: 'record' | 'instrument';
}) {
  const width = isMidi ? 542 : 497,
    height = isMidi ? 150 : 122;
  return (
    <DawTrackExampleFigure>
      <DawTrackExampleIcon
        role="img"
        aria-label={isMidi ? '미디 트랙 원본 예시' : '오디오 트랙 원본 예시'}
        viewBox={'0 0 ' + width + ' ' + height}
      >
        <image href={isMidi ? midi : audio} width={width} height={height} />
        {highlight === 'record' && (
          <rect
            x="7"
            y="60"
            width="28"
            height="27"
            rx="4"
            fill="none"
            stroke="#f4d890"
            strokeWidth="2"
          />
        )}
        {highlight === 'instrument' && (
          <rect
            x="5"
            y="33"
            width="201"
            height="32"
            rx="4"
            fill="none"
            stroke="#f4d890"
            strokeWidth="2"
          />
        )}
      </DawTrackExampleIcon>
      <DawTrackExampleFigcaption>
        예시 · {isMidi ? '미디 트랙' : '오디오 트랙'}
      </DawTrackExampleFigcaption>
    </DawTrackExampleFigure>
  );
}
export function MidiSettingsExample() {
  return (
    <MidiSettingsExampleFigure>
      <MidiSettingsExampleContainer>
        <SourceCrop
          crop={{ midi: true, x: 5, y: 33, width: 201, height: 32 }}
          label="악기 종류와 가상악기 선택 영역"
        />
      </MidiSettingsExampleContainer>
      <MidiSettingsExampleContainer2>
        <SourceCrop crop={controls['+ 미디 클립']} label="미디 클립 추가 버튼" />
      </MidiSettingsExampleContainer2>
      <MidiSettingsExampleFigcaption>
        예시 · 악기 선택과 미디 클립 추가
      </MidiSettingsExampleFigcaption>
    </MidiSettingsExampleFigure>
  );
}

const SourceCropIcon = styledWeb('svg')({
  '&&&&': { display: 'block', maxWidth: '100%', background: '#333b36' },
});

const DawTrackExampleFigure = styledWeb('figure')({
  '&&&&': {
    margin: '10px 0 16px',
    border: '1px solid #647167',
    borderRadius: 6,
    overflow: 'hidden',
  },
});

const DawTrackExampleIcon = styledWeb('svg')({ '&&&&': { display: 'block', width: '100%' } });

const DawTrackExampleFigcaption = styledWeb('figcaption')({
  '&&&&': { padding: 5, fontSize: 11, color: '#7b8795', background: 'white' },
});

const MidiSettingsExampleFigure = styledWeb('figure')({
  '&&&&': {
    margin: '12px 0',
    padding: 10,
    border: '1px solid #647167',
    borderRadius: 6,
    background: '#333b36',
  },
});

const MidiSettingsExampleContainer = styledWeb('div')({
  '&&&&': {
    border: '2px solid #f4d890',
    borderRadius: 5,
    padding: 3,
    display: 'inline-block',
    maxWidth: '100%',
  },
});

const MidiSettingsExampleContainer2 = styledWeb('div')({ '&&&&': { marginTop: 10 } });

const MidiSettingsExampleFigcaption = styledWeb('figcaption')({
  '&&&&': { marginTop: 8, color: '#bdcdbf', fontSize: 11 },
});
