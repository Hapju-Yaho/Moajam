import { useState } from 'react';
import { ActionButton, Copy, FlexRow, Heading, Meta, Surface } from '@component/shared/ui/ProductUI';
import { Input } from '@styles/layout';
import { api, serverConfigured } from '@lib/remote';
import { shareLink } from '@lib/platformActions';
export function InvitationPanel({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const [invitation, setInvitation] = useState<{
    id: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setError('');
    try {
      setInvitation(await api(`/workspaces/${workspaceId}/invitations`, 'POST'));
    } catch (error) {
      setError(error instanceof Error ? error.message : '초대를 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Surface>
      <Heading>멤버 초대</Heading>
      {!serverConfigured ? (
        <Meta>
          현재는 이 브라우저의 개인 데이터로 사용 중입니다. 서버 로그인이 연결되면 실제 밴드 초대를
          발급할 수 있습니다.
        </Meta>
      ) : null}
      {!canManage ? <Meta>초대 발급은 Owner만 할 수 있습니다.</Meta> : null}
      <ActionButton
        disabled={!serverConfigured || !canManage || busy}
        onPress={() => void create()}
      >
        {busy ? '발급 중…' : '새 초대 발급'}
      </ActionButton>
      {invitation ? (
        <>
          <Copy>만료: {new Date(invitation.expiresAt).toLocaleString('ko-KR')}</Copy>
          <Input editable={false} value={invitation.token} />
          <FlexRow wrap>
            <ActionButton
              secondary
              onPress={() =>
                void shareLink(`/settings?invite=${encodeURIComponent(invitation.token)}`)
                  .then(() => setError('초대 링크를 복사했습니다.'))
                  .catch(() => setError('복사하지 못했어요. 초대 코드를 직접 복사해주세요.'))
              }
            >
              링크 복사
            </ActionButton>
            <ActionButton
              secondary
              danger
              onPress={() =>
                void api(`/workspaces/${workspaceId}/invitations/${invitation.id}`, 'DELETE')
                  .then(() => {
                    setInvitation(null);
                    setError('초대를 취소했습니다.');
                  })
                  .catch(() => setError('초대를 취소하지 못했어요.'))
              }
            >
              초대 철회
            </ActionButton>
          </FlexRow>
        </>
      ) : null}
      {error ? <Meta accessibilityLiveRegion="polite">{error}</Meta> : null}
    </Surface>
  );
}
