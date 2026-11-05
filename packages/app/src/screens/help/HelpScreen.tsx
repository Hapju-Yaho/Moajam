import styledNative from '@emotion/native';
import { theme } from '@moajam/ui';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import {
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageDescription,
  PageHeading,
  PageTop,
  ResponsiveGrid,
  SoftIcon,
  Stack,
  Surface,
} from '@component/shared/ui/ProductUI';
import { AppIcon } from '@component/shared/icons';
import type { AppRoute, ScreenProps } from '@app/navigation';
import { Input } from '@styles/layout';

const guides: { title: string; detail: string; route: AppRoute }[] = [
  { title: '악보 편집', detail: '개인 악보와 밴드 악보 작성·버전 관리', route: 'tools' },
  {
    title: '참여곡 상세',
    detail: '곡 의견, 파트별 PDF 악보와 작업실 녹음·편집',
    route: 'personal-practice',
  },
  { title: '팀 관리', detail: '참여 중인 팀과 멤버 확인', route: 'personal-songs' },
  { title: '개인 홈', detail: '내 밴드의 일정과 참여 곡을 모아보기', route: 'personal-home' },
  {
    title: '곡 추천과 채택',
    detail: '선택한 밴드에서 후보를 추천하고 연습곡으로 정하기',
    route: 'recommendations',
  },
  {
    title: '작업실',
    detail: '파일을 올리고 함께 재생하거나 내 연주 녹음하기',
    route: 'track-editor',
  },
  {
    title: '내 악기 추출',
    detail: '원본 업로드, 악기 분리 요청과 결과 비교',
    route: 'instrument',
  },
];
const faqs = [
  [
    '작업실에서 어떤 파일을 사용할 수 있나요?',
    '기기에서 재생할 수 있는 100MB 이하 오디오를 추가할 수 있습니다. 악기 분리는 웹의 내 악기 추출에서 요청하며, 로그인과 분리 작업 서버 연결이 필요합니다.',
  ],
  [
    '내 녹음이 다른 멤버에게 공개되나요?',
    '개인 악보는 비공개입니다. 밴드 곡의 악보를 저장하거나 사운드 트랙 변경사항을 공유하면 해당 밴드 멤버가 볼 수 있어요. 데모 모드의 트랙 파일은 해당 브라우저 계정에만 저장됩니다.',
  ],
  [
    '개인 화면과 밴드 화면은 어떻게 다른가요?',
    '개인 화면에서는 소속 밴드의 일정과 곡을 모아봅니다. 밴드 화면에서는 선택한 밴드의 추천곡, 채택곡, 합주와 멤버를 관리합니다. 사이드바 상단에서 밴드를 바꿀 수 있습니다.',
  ],
];

export function HelpScreen({ navigate }: ScreenProps) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(0);
  const [query, setQuery] = useState('');
  const visible = guides.filter(({ title, detail }) =>
    `${title}${detail}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <HelpScreenPanel tint="#eef4ff">
        <HelpScreenPageTop>
          <PageHeading>무엇을 도와드릴까요?</PageHeading>
          <PageDescription>모아잼의 기능과 합주 준비 방법을 빠르게 찾아보세요.</PageDescription>
        </HelpScreenPageTop>
        <HelpScreenContainer>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="기능이나 궁금한 점을 검색하세요"
          />
        </HelpScreenContainer>
      </HelpScreenPanel>
      <ResponsiveGrid stacked={width < 850}>
        <HelpScreenStack gap={12} $width={width}>
          <Heading>주요 가이드</Heading>
          {visible.length === 0 ? (
            <Surface>
              <Copy>검색한 가이드가 없어요.</Copy>
              <Meta>다른 기능 이름으로 검색해보세요.</Meta>
            </Surface>
          ) : null}
          {visible.map(({ title, detail, route }) => (
            <Pressable key={title} accessibilityRole="button" onPress={() => navigate(route)}>
              <Surface>
                <FlexRow>
                  <SoftIcon>
                    <AppIcon
                      name={
                        route === 'track-editor'
                          ? 'songs'
                          : route === 'instrument'
                            ? 'guitar'
                            : 'help'
                      }
                      color={theme.colors.primary}
                    />
                  </SoftIcon>
                  <HelpScreenContainer2>
                    <HelpScreenCopy>{title}</HelpScreenCopy>
                    <Meta>{detail}</Meta>
                  </HelpScreenContainer2>
                  <AppIcon name="chevron-right" color={theme.colors.textMuted} />
                </FlexRow>
              </Surface>
            </Pressable>
          ))}
        </HelpScreenStack>
        <HelpScreenStack2 gap={12} $width={width}>
          <Heading>자주 묻는 질문</Heading>
          <Surface>
            {faqs.map(([question, answer], index) => (
              <HelpScreenButton
                key={question}
                onPress={() => setOpen(open === index ? -1 : index)}
                $index={index}
              >
                <FlexBetween>
                  <HelpScreenCopy2>{question}</HelpScreenCopy2>
                  <Copy>{open === index ? '−' : '+'}</Copy>
                </FlexBetween>
                {open === index ? <HelpScreenMeta>{answer}</HelpScreenMeta> : null}
              </HelpScreenButton>
            ))}
          </Surface>
          <Surface tint="#f8faff">
            <Heading>답을 찾지 못했나요?</Heading>
            <Meta>
              문의 접수 채널은 아직 연결되지 않았습니다. 정식 문의 창구가 마련되면 이곳에서
              안내합니다.
            </Meta>
          </Surface>
        </HelpScreenStack2>
      </ResponsiveGrid>
    </>
  );
}

const HelpScreenPanel = styledNative(Surface)({ paddingTop: 28, paddingBottom: 28 });

const HelpScreenPageTop = styledNative(PageTop)({ alignItems: 'center' });

const HelpScreenContainer = styledNative(View)({
  width: '100%',
  maxWidth: 620,
  alignSelf: 'center',
});

const HelpScreenStack = styledNative(Stack, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ($width < 850 ? undefined : { flex: 1.2 }));

const HelpScreenContainer2 = styledNative(View)({ flex: 1 });

const HelpScreenCopy = styledNative(Copy)({ fontWeight: '600' });

const HelpScreenStack2 = styledNative(Stack, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ($width < 850 ? undefined : { flex: 1 }));

const HelpScreenButton = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $index: number }>(({ $index }) => ({
  paddingTop: 9,
  paddingBottom: 9,
  borderBottomWidth: $index < faqs.length - 1 ? 1 : 0,
  borderBottomColor: theme.colors.border,
}));

const HelpScreenCopy2 = styledNative(Copy)({ flex: 1, fontWeight: '500' });

const HelpScreenMeta = styledNative(Meta)({ marginTop: 8 });
