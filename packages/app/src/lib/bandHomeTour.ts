export type BandHomeTourInfo = {
  canManage: boolean;
  hasNext: boolean;
  hasSongs: boolean;
  hasCandidates: boolean;
};
export function bandHomeTourSteps({
  canManage,
  hasNext,
  hasSongs,
  hasCandidates,
}: BandHomeTourInfo) {
  return [
    {
      title: '밴드에 참여하신 걸 환영해요!',
      body: '곡 선택부터 합주와 연습까지, 함께 준비해보세요.',
      target: '',
    },
    {
      title: '다음 합주',
      body: hasNext
        ? '다가오는 합주의 날짜·장소·목표를 확인하세요.'
        : canManage
          ? '아직 예정된 합주가 없어요. 첫 합주를 준비해보세요.'
          : '새 합주가 등록되면 여기에서 확인할 수 있어요.',
      target: 'tour-band-next',
    },
    {
      title: '밴드 캘린더',
      body: canManage
        ? '날짜를 눌러 일정을 추가하고, 등록된 일정을 확인하세요.'
        : '등록된 합주 일정을 눌러 자세히 확인하세요.',
      target: 'tour-home-calendar',
    },
    {
      title: '함께 연습할 곡',
      body: hasSongs
        ? '곡을 누르면 상세 정보로, 연습하기를 누르면 연습실로 이동해요.'
        : '함께 연주하고 싶은 곡을 먼저 추천해보세요.',
      target: 'tour-home-songs',
    },
    ...(hasCandidates
      ? [
          {
            title: '다음 채택 후보',
            body: '추천된 곡을 살펴보고 의견과 좋아요를 남겨보세요.',
            target: 'tour-band-candidates',
          },
        ]
      : []),
    {
      title: '곡 추천하기',
      body: '참여곡 화면에서 함께 연주할 곡을 추천해보세요.',
      target: 'tour-band-nav-songs',
    },
    {
      title: '연습실',
      body: '악보를 열고 편집하거나, 팀원들과 녹음을 공유해보세요.',
      target: 'tour-band-nav-practice',
    },
    {
      title: '설정과 멤버',
      body: '밴드 정보와 함께하는 멤버를 확인하세요.',
      target: 'tour-band-manage',
    },
    {
      title: '함께 시작해볼까요?',
      body: '물음표 버튼에서 이 안내를 다시 볼 수 있어요.',
      target: 'tour-help',
    },
  ];
}
