export function DawExample({ kind }: { kind: 'tracks' | 'midi' | 'clips' | 'editor' }) {
  const editor = kind === 'editor';
  return (
    <figure
      style={{
        margin: '12px 0',
        border: '1px solid #dce4f0',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <svg
        role="img"
        aria-label={
          editor
            ? '미디 음표 편집 예시'
            : kind === 'midi'
              ? '미디 트랙의 악기 선택 예시'
              : '오디오·미디 트랙과 클립 예시'
        }
        viewBox="0 0 320 136"
        style={{ width: '100%', display: 'block', background: '#29322c' }}
      >
        <text x="12" y="18" fill="#dce9df" fontSize="10">
          {editor ? '미디 악보 편집 · 음표 추가' : '세션 / 트랙'}
        </text>
        {[38, 66, 94, 122].map((y) => (
          <path key={y} d={'M0 ' + y + 'H320'} stroke="#566358" strokeWidth="0.5" />
        ))}
        {[120, 160, 200, 240, 280].map((x) => (
          <path key={x} d={'M' + x + ' 26V136'} stroke="#566358" strokeWidth="0.5" />
        ))}
        {editor ? (
          <>
            {['C5', 'B4', 'A4'].map((n, i) => (
              <text key={n} x="12" y={56 + i * 28} fontSize="10" fill="#dce9df">
                {n}
              </text>
            ))}
            <rect x="120" y="44" width="40" height="15" rx="3" fill="#9fd1b0" />
            <rect x="160" y="72" width="80" height="15" rx="3" fill="#f4d890" />
            <path d="M175 107h50m-7-4 7 4-7 4" stroke="#dce9df" fill="none" />
          </>
        ) : (
          <>
            <rect x="0" y="27" width="116" height="109" fill="#35413a" />
            <text x="10" y="48" fill="#e0ebe3" fontSize="11">
              오디오 트랙
            </text>
            <circle cx="17" cy="67" r="5" stroke="#e2a1a1" fill="#c65c5c" />
            <text x="30" y="71" fill="#e0ebe3" fontSize="9">
              녹음 대상
            </text>
            <text x="10" y="99" fill="#e0ebe3" fontSize="11">
              미디 트랙
            </text>
            <rect x="8" y="108" width="100" height="19" rx="3" fill="#eaf0fc" />
            <text x="13" y="121" fill="#283f34" fontSize="9">
              기타 ▾ 어쿠스틱 ▾
            </text>
            <rect x="126" y="36" width="145" height="39" rx="3" fill="#52725d" stroke="#9ec7af" />
            <text x="132" y="49" fill="#e0ebe3" fontSize="9">
              내 연주.wav
            </text>
            <path d="M132 62h8l4-6 5 13 5-17 6 16 5-11 4 5h94" stroke="#a8d1b3" fill="none" />
            <rect x="159" y="88" width="123" height="39" rx="3" fill="#4d6276" stroke="#9bb9dc" />
            <text x="165" y="101" fill="#e0ebe3" fontSize="9">
              미디 클립.mid
            </text>
            <path d="M166 119h20m3-5h25m3 6h32m3-8h20" stroke="#c5d9f5" strokeWidth="3" />
            {kind === 'midi' && (
              <rect
                x="6"
                y="106"
                width="104"
                height="23"
                rx="4"
                fill="none"
                stroke="#f4d890"
                strokeWidth="2"
              />
            )}
          </>
        )}
      </svg>
      <figcaption style={{ padding: 6, color: '#7b8795', fontSize: 11 }}>
        사용법을 설명하기 위한 예시 화면입니다.
      </figcaption>
    </figure>
  );
}

export { DawTrackExample, MidiSettingsExample } from './DawOriginalExample.web';
