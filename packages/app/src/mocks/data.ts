import type { PreparationStatus } from '@moajam/domain';
import { songMedia } from '@lib/songMedia';

export interface RecommendationItem {
  likedBy?: string[];
  votedBy?: string[];
  likedByMe?: boolean;
  votedByMe?: boolean;
  deferred?: boolean;
  deferredReason?: string;
  authorId?: string;
  id: string;
  title: string;
  artist: string;
  reason: string;
  likes: number;
  votes: number;
  comments: number;
  tint: string;
  year: number;
  recommendedAt: string;
  thumbnailUrl?: string;
  referenceUrl?: string;
}

export const recommendations: RecommendationItem[] = [
  {
    id: 'creep',
    title: 'Creep',
    artist: 'Radiohead',
    reason: '인트로부터 분위기가 확 살아서 오프닝 곡으로 좋을 것 같아요.',
    likes: 8,
    votes: 5,
    comments: 12,
    tint: '#e86545',
    year: 1993,
    recommendedAt: '2024-09-10T13:20:00+09:00',
    thumbnailUrl: songMedia.creep.thumbnailUrl,
    referenceUrl: songMedia.creep.youtubeUrl,
  },
  {
    id: 'dont-look-back',
    title: "Don't Look Back in Anger",
    artist: 'Oasis',
    reason: '다 같이 부르기 좋고, 엔딩 밴드 사운드를 맞춰보고 싶어요.',
    likes: 12,
    votes: 9,
    comments: 7,
    tint: '#9c8357',
    year: 1995,
    recommendedAt: '2024-09-09T20:15:00+09:00',
    thumbnailUrl: songMedia['dont-look-back'].thumbnailUrl,
    referenceUrl: songMedia['dont-look-back'].youtubeUrl,
  },
  {
    id: 'teen-spirit',
    title: 'Smells Like Teen Spirit',
    artist: 'Nirvana',
    reason: '에너지 넘치는 곡을 한 곡쯤 넣으면 좋겠어요.',
    likes: 8,
    votes: 6,
    comments: 10,
    tint: '#198fbd',
    year: 1991,
    recommendedAt: '2024-09-08T18:40:00+09:00',
    thumbnailUrl: songMedia['teen-spirit'].thumbnailUrl,
    referenceUrl: songMedia['teen-spirit'].youtubeUrl,
  },
  {
    id: 'i-wanna-be-yours',
    title: 'I Wanna Be Yours',
    artist: 'Arctic Monkeys',
    reason: '베이스와 보컬의 밸런스를 연습하기 좋은 곡이에요.',
    likes: 4,
    votes: 2,
    comments: 3,
    tint: '#303845',
    year: 2013,
    recommendedAt: '2024-09-07T22:05:00+09:00',
  },
];

export const adoptedSongs = recommendations.slice(0, 3).map((song, index) => ({
  ...song,
  ready: index === 0 ? 2 : index === 1 ? 3 : 1,
  total: 4,
  status: index === 1 ? 'READY' : 'PRACTICING',
}));

export const members = [
  { id: 'm1', name: '김민수', part: 'Guitar', role: 'OWNER', initials: '민수', color: '#ffd8c8' },
  { id: 'm2', name: '이영희', part: 'Vocal', role: 'MEMBER', initials: '영희', color: '#fde4bc' },
  { id: 'm3', name: '박준호', part: 'Bass', role: 'MEMBER', initials: '준호', color: '#d8f2e3' },
  { id: 'm4', name: '박지수', part: 'Drums', role: 'MEMBER', initials: '지수', color: '#d7e8ff' },
  {
    id: 'm5',
    name: '최인수',
    part: 'Guitar 2',
    role: 'MEMBER',
    initials: '인수',
    color: '#e9dcff',
  },
];

export const preparations: Array<{
  id: string;
  part: string;
  member: string;
  status: PreparationStatus;
}> = [
  { id: 'p1', part: 'Vocal', member: '이영희', status: 'READY' },
  { id: 'p2', part: 'Guitar 1', member: '김민수', status: 'PRACTICING' },
  { id: 'p3', part: 'Bass', member: '박준호', status: 'READY' },
  { id: 'p4', part: 'Drums', member: '박지수', status: 'NOT_READY' },
];

export const initialChecklist = [
  { id: 'c1', label: 'Key: G (원곡과 동일)', done: true },
  { id: 'c2', label: 'Intro: 4마디', done: true },
  { id: 'c3', label: '2절: Guitar 1 제외', done: true },
  { id: 'c4', label: 'Ending: 마지막 Chorus ×2 후 Stop', done: false },
  { id: 'c5', label: 'Guitar tone 확인', done: false },
];

export const comments = [
  {
    id: 't1',
    time: '01:42',
    part: 'Guitar',
    author: '김민수',
    text: '여기 기타 들어오는 타이밍을 반 박자 정도 늦춰보면 좋을 것 같음.',
  },
  {
    id: 't2',
    time: '02:17',
    part: 'Bass',
    author: '이영희',
    text: '이 부분 베이스 음이 원곡이랑 다른 것 같은데 확인해보자.',
  },
  {
    id: 't3',
    time: '01:32–01:48',
    part: 'Chorus',
    author: '박지수',
    text: '이 구간 다이내믹을 조금 낮췄다가 후렴에서 터뜨리자.',
  },
];
