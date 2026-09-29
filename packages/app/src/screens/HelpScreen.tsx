import { theme } from '@moajam/ui';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
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
} from '../components/ProductUI';
import { AppIcon } from '../components/icons';
import type { AppRoute, ScreenProps } from '../navigation';
import { Input } from '../styles/layout';

const guides: { title: string; detail: string; route: AppRoute }[] = [
  { title: '개인 홈', detail: '내 밴드의 일정과 참여 곡을 모아보기', route: 'personal-home' },
  {
    title: '곡 추천과 채택',
    detail: '선택한 밴드에서 후보를 추천하고 연습곡으로 정하기',
    route: 'recommendations',
  },
  {
    title: '멀티트랙 연습',
    detail: '파일을 올리고 함께 재생하거나 내 연주 녹음하기',
    route: 'personal-practice',
  },
  {
    title: '내 악기 추출',
    detail: '원본 업로드, 악기 분리 요청과 결과 비교',
    route: 'instrument',
  },
];
const faqs = [
  [
    '연습실에서 어떤 파일을 사용할 수 있나요?',
    '기기에서 재생할 수 있는 100MB 이하 오디오를 추가할 수 있습니다. 악기 분리는 웹의 내 악기 추출에서 요청하며, 로그인과 분리 작업 서버 연결이 필요합니다.',
  ],
  [
    '내 녹음이 다른 멤버에게 공개되나요?',
    '로그인 상태의 개인 녹음과 악보는 내 계정에 비공개로 저장되어 다른 기기에서 불러올 수 있습니다. 밴드 공개를 선택한 파일만 멤버에게 공유됩니다. 데모 모드의 파일은 해당 기기에만 저장됩니다.',
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
    <AppShell activeRoute="help" onNavigate={navigate}>
      <Surface tint="#eef4ff" style={{ paddingVertical: 28 }}>
        <PageTop style={{ alignItems: 'center' }}>
          <PageHeading>무엇을 도와드릴까요?</PageHeading>
          <PageDescription>모아잼의 기능과 합주 준비 방법을 빠르게 찾아보세요.</PageDescription>
        </PageTop>
        <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center' }}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="기능이나 궁금한 점을 검색하세요"
          />
        </View>
      </Surface>
      <ResponsiveGrid stacked={width < 850}>
        <Stack gap={12} style={width < 850 ? undefined : { flex: 1.2 }}>
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
                        route === 'personal-practice'
                          ? 'songs'
                          : route === 'instrument'
                            ? 'guitar'
                            : 'help'
                      }
                      color={theme.colors.primary}
                    />
                  </SoftIcon>
                  <View style={{ flex: 1 }}>
                    <Copy style={{ fontWeight: '600' }}>{title}</Copy>
                    <Meta>{detail}</Meta>
                  </View>
                  <AppIcon name="chevron-right" color={theme.colors.textMuted} />
                </FlexRow>
              </Surface>
            </Pressable>
          ))}
        </Stack>
        <Stack gap={12} style={width < 850 ? undefined : { flex: 1 }}>
          <Heading>자주 묻는 질문</Heading>
          <Surface>
            {faqs.map(([question, answer], index) => (
              <Pressable
                key={question}
                onPress={() => setOpen(open === index ? -1 : index)}
                style={{
                  paddingVertical: 9,
                  borderBottomWidth: index < faqs.length - 1 ? 1 : 0,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <FlexBetween>
                  <Copy style={{ flex: 1, fontWeight: '500' }}>{question}</Copy>
                  <Copy>{open === index ? '−' : '+'}</Copy>
                </FlexBetween>
                {open === index ? <Meta style={{ marginTop: 8 }}>{answer}</Meta> : null}
              </Pressable>
            ))}
          </Surface>
          <Surface tint="#f8faff">
            <Heading>답을 찾지 못했나요?</Heading>
            <Meta>
              문의 접수 채널은 아직 연결되지 않았습니다. 정식 문의 창구가 마련되면 이곳에서
              안내합니다.
            </Meta>
          </Surface>
        </Stack>
      </ResponsiveGrid>
    </AppShell>
  );
}
