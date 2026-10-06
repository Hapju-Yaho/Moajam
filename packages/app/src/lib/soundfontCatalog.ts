export const soundfontInstruments = [
  { id: 'acoustic_guitar_nylon', label: '클래식 기타', group: '기타' },
  { id: 'acoustic_guitar_steel', label: '어쿠스틱 기타', group: '기타' },
  { id: 'electric_guitar_clean', label: '일렉 기타 · 클린', group: '기타' },
  { id: 'overdriven_guitar', label: '일렉 기타 · 오버드라이브', group: '기타' },
  { id: 'acoustic_bass', label: '어쿠스틱 베이스', group: '베이스' },
  { id: 'electric_bass_finger', label: '베이스 · 핑거', group: '베이스' },
  { id: 'electric_bass_pick', label: '베이스 · 피크', group: '베이스' },
  { id: 'slap_bass_1', label: '베이스 · 슬랩', group: '베이스' },
  { id: 'acoustic_grand_piano', label: '그랜드 피아노', group: '건반·기타 악기' },
  { id: 'electric_piano_1', label: '일렉 피아노', group: '건반·기타 악기' },
  { id: 'string_ensemble_1', label: '스트링', group: '건반·기타 악기' },
  { id: 'choir_aahs', label: '합창', group: '건반·기타 악기' },
  { id: 'synth_drum', label: '신스 드럼', group: '퍼커션' },
] as const;

export type SoundfontInstrumentId = (typeof soundfontInstruments)[number]['id'];
export function isSoundfontInstrument(value: unknown): value is SoundfontInstrumentId {
  return soundfontInstruments.some((instrument) => instrument.id === value);
}

export function defaultSoundfontInstrument(part: string, notation?: string): SoundfontInstrumentId {
  if (notation === 'piano' || notation === 'pianoBass') return 'acoustic_grand_piano';
  if (notation?.startsWith('bass') || /bass|베이스/i.test(part)) return 'electric_bass_finger';
  if (/drum|드럼/i.test(part)) return 'synth_drum';
  if (/vocal|보컬|합창/i.test(part)) return 'choir_aahs';
  if (/piano|keyboard|피아노|건반/i.test(part)) return 'acoustic_grand_piano';
  return 'acoustic_guitar_steel';
}
