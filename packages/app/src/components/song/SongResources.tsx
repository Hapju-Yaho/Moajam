import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useMockAppState, useWorkspaceValue } from '../../state/MockAppState';
import type { ScreenProps } from '../../navigation';
import { parseVideoUrl } from '../../lib/video';
import { Input } from '../../styles/layout';
import { ActionButton, Copy, FlexRow, Heading, Meta, Surface } from '../ProductUI';
import { MediaLibrary } from '../MediaLibrary';
import { ReferenceVideo } from '../ReferenceVideo';
export type SongLink = { id: string; title: string; url: string; authorId?: string };
export function SongResources({
  songId,
  navigate,
}: {
  songId: string;
  navigate: ScreenProps['navigate'];
}) {
  const { workspaceId, currentUserId, canManage, members } = useMockAppState();
  const [links, setLinks] = useWorkspaceValue<SongLink[]>(`song/${songId}/links`, []);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const reset = () => {
    setEditing(null);
    setTitle('');
    setUrl('');
    setMessage('');
  };
  const visible = links.filter((link) =>
    `${link.title} ${link.url}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const save = () => {
    try {
      const parsed = new URL(url.trim());
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.href.length > 4000
      )
        throw new Error();
      const normalized = parseVideoUrl(parsed.href)?.url ?? parsed.href;
      if (links.some((link) => link.id !== editing && link.url === normalized)) {
        setMessage('이미 등록한 링크예요. 기존 자료를 확인해주세요.');
        return;
      }
      setLinks((all) =>
        editing
          ? all.map((link) =>
              link.id === editing ? { ...link, title: title.trim(), url: normalized } : link,
            )
          : [
              ...all,
              {
                id: `link-${Date.now()}`,
                title: title.trim(),
                url: normalized,
                authorId: currentUserId,
              },
            ],
      );
      reset();
      setMessage(editing ? '링크를 수정했어요.' : '링크를 추가했어요.');
    } catch {
      setMessage('http 또는 https로 시작하는 올바른 링크를 입력해주세요.');
    }
  };
  return (
    <>
      <Surface>
        <Heading>악보와 음원</Heading>
        <Meta>곡에 필요한 파일을 모아두세요. 연습 녹음은 연습 탭에서 관리해요.</Meta>
        <ActionButton
          secondary
          onPress={() => navigate('score-editor', { id: songId, workspaceId })}
        >
          이 곡의 악보 편집기 열기
        </ActionButton>
      </Surface>
      <MediaLibrary scopeKey={`song/${workspaceId}/${songId}`} />
      <Surface>
        <Heading>레퍼런스 링크 · {links.length}</Heading>
        <Meta>
          영상 링크는 여기서 재생할 수 있어요. 링크는 작성자와 밴드 관리자가 수정·삭제할 수 있어요.
        </Meta>
        <Input
          accessibilityLabel="레퍼런스 검색"
          value={query}
          onChangeText={setQuery}
          placeholder="이름 또는 링크 검색"
        />
        {visible.map((link) => (
          <View
            key={link.id}
            style={{
              gap: 10,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#edf1f6',
            }}
          >
            <Copy>{link.title}</Copy>
            <Meta numberOfLines={2}>{link.url}</Meta>
            <Meta>
              {members.find((member) => member.id === link.authorId)?.name ?? '기존 자료'}
            </Meta>
            {parseVideoUrl(link.url) && (
              <ReferenceVideo referenceUrl={link.url} title={link.title} />
            )}
            <FlexRow wrap>
              <ActionButton
                secondary
                compact
                onPress={() =>
                  void Linking.openURL(link.url).catch(() =>
                    setMessage('링크를 열지 못했어요. 주소를 확인해주세요.'),
                  )
                }
              >
                원본 열기
              </ActionButton>
              {(canManage || link.authorId === currentUserId) && (
                <>
                  <ActionButton
                    secondary
                    compact
                    onPress={() => {
                      setEditing(link.id);
                      setTitle(link.title);
                      setUrl(link.url);
                      setMessage('아래 입력란에서 링크를 수정해주세요.');
                    }}
                  >
                    링크 수정
                  </ActionButton>
                  <ActionButton
                    secondary
                    compact
                    onPress={() => {
                      setLinks((all) => all.filter((item) => item.id !== link.id));
                      if (editing === link.id) reset();
                    }}
                  >
                    링크 삭제
                  </ActionButton>
                </>
              )}
            </FlexRow>
          </View>
        ))}
        {!visible.length && (
          <Meta>
            {links.length
              ? '검색 결과가 없어요.'
              : '아직 레퍼런스가 없어요. 원곡, 편곡 예시나 악보 링크를 추가해보세요.'}
          </Meta>
        )}
        <Heading style={{ fontSize: 16 }}>{editing ? '링크 수정' : '새 링크 추가'}</Heading>
        <Input
          accessibilityLabel="레퍼런스 이름"
          value={title}
          maxLength={300}
          onChangeText={setTitle}
          placeholder="예: 라이브 편곡 참고"
        />
        <Input
          accessibilityLabel="레퍼런스 주소"
          value={url}
          maxLength={4000}
          onChangeText={setUrl}
          autoCapitalize="none"
          placeholder="https://"
        />
        <FlexRow>
          <ActionButton disabled={!title.trim() || !url.trim()} onPress={save}>
            {editing ? '변경 적용' : '링크 추가'}
          </ActionButton>
          {editing && (
            <ActionButton secondary onPress={reset}>
              취소
            </ActionButton>
          )}
        </FlexRow>
        {!!message && <Meta accessibilityLiveRegion="polite">{message}</Meta>}
      </Surface>
    </>
  );
}
