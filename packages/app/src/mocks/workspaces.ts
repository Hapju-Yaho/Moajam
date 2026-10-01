import { adoptedSongs, members, recommendations } from './data';

export type Preparation = 'NOT_READY' | 'PRACTICING' | 'READY';
export type WorkspaceSong = (typeof recommendations)[number] & {
  goal?: string;
  participants?: Record<string, { part: string; status: Preparation }>;
  archived?: boolean;
  ready: number;
  total: number;
  status: 'READY' | 'PRACTICING';
  myStatus: Preparation;
  myPart: string;
};
export interface Rehearsal {
  cancelled?: boolean;
  songIds?: string[];
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  place: string;
  goal: string;
}
export interface Workspace {
  documents?: Record<string, unknown>;
  id: string;
  name: string;
  description: string;
  photo?: string;
  color: string;
  members: ((typeof members)[number] & { photo?: string })[];
  recommendations: typeof recommendations;
  adoptedSongs: WorkspaceSong[];
  rehearsals: Rehearsal[];
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function createWorkspaces(): Workspace[] {
  const upcoming = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return dateKey(date);
  };
  return [
    {
      id: 'ws-demo',
      name: '주말 합주단',
      color: '#4f75d8',
      description: '주말마다 모여 좋아하는 음악을 함께 연주해요.',
      members: members.map((member) => ({ ...member })),
      recommendations: recommendations.map((song) => ({ ...song })),
      adoptedSongs: adoptedSongs.map((song) => ({
        ...song,
        status: song.ready === song.total ? 'READY' : 'PRACTICING',
        myStatus: 'PRACTICING',
        myPart: 'Guitar',
      })),
      rehearsals: [
        {
          id: 'session-1',
          title: '정기 합주',
          date: upcoming(2),
          start: '18:00',
          end: '21:00',
          place: '홍대 합주실 A룸',
          goal: 'Creep 전체 합주와 엔딩 맞추기',
        },
        {
          id: 'session-2',
          title: '셋리스트 맞추기',
          date: upcoming(9),
          start: '17:00',
          end: '20:00',
          place: '합정 합주실 B룸',
          goal: '세 곡 이어서 연주하기',
        },
      ],
    },
    {
      id: 'ws-sunday',
      name: '일요일의 소음',
      color: '#a5688d',
      description: '조금 다른 박자로, 우리만의 사운드를 찾아요.',
      members: [
        { ...members[0], part: 'Bass', role: 'MEMBER' },
        {
          id: 's2',
          name: '김하은',
          part: 'Drums',
          role: 'OWNER',
          initials: '하은',
          color: '#fde4bc',
        },
        {
          id: 's3',
          name: '정유진',
          part: 'Vocal',
          role: 'MEMBER',
          initials: '유진',
          color: '#d7e8ff',
        },
        {
          id: 's4',
          name: '이현우',
          part: 'Guitar',
          role: 'MEMBER',
          initials: '현우',
          color: '#d8f2e3',
        },
      ],
      recommendations: [recommendations[0], recommendations[3]].map((song) => ({
        ...song,
        likes: 0,
        votes: 0,
        comments: 0,
      })),
      adoptedSongs: [
        {
          ...recommendations[0],
          comments: 0,
          ready: 1,
          total: 4,
          status: 'PRACTICING',
          myStatus: 'READY',
          myPart: 'Bass',
        },
        {
          ...recommendations[3],
          comments: 0,
          ready: 0,
          total: 4,
          status: 'PRACTICING',
          myStatus: 'NOT_READY',
          myPart: 'Bass',
        },
      ],
      rehearsals: [
        {
          id: 'session-3',
          title: '첫 곡 맞추기',
          date: upcoming(3),
          start: '14:00',
          end: '16:00',
          place: '신촌 사운드 스튜디오',
          goal: '베이스와 드럼 리듬 맞추기',
        },
      ],
    },
  ];
}
