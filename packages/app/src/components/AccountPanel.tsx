import { useState } from 'react';
import type { ScreenProps } from '../navigation';
import { ActionButton, Heading, Meta, Surface } from './ProductUI';
import { Input } from '../styles/layout';
import { api, serverConfigured, signOut } from '../lib/remote';
import { useMockAppState } from '../state/MockAppState';
export function AccountPanel({ navigate }: Pick<ScreenProps, 'navigate'>) {
  const { reloadRemote, workspaceId, canManage, members, leaveWorkspace, selectWorkspace } =
    useMockAppState();
  const [token, setToken] = useState(
    typeof location === 'undefined'
      ? ''
      : (new URLSearchParams(location.search).get('invite') ?? ''),
  );
  const [message, setMessage] = useState('');
  const [joining, setJoining] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const lastOwner =
    members.length > 1 &&
    canManage &&
    members.filter((member) => member.role === 'OWNER').length <= 1;
  if (!serverConfigured) return null;
  return (
    <Surface>
      <Heading>계정과 밴드 가입</Heading>
      <Input value={token} onChangeText={setToken} placeholder="초대 코드" />
      <ActionButton
        disabled={joining || !token.trim()}
        onPress={() => {
          setJoining(true);
          setMessage('');
          void api<{ workspaceId: string }>('/invitations/accept', 'POST', { token: token.trim() })
            .then(async ({ workspaceId: joinedId }) => {
              await reloadRemote();
              setToken('');
              selectWorkspace(joinedId);
              navigate('home', { workspaceId: joinedId });
            })
            .catch((error: Error) => setMessage(error.message))
            .finally(() => setJoining(false));
        }}
      >
        초대 수락
      </ActionButton>
      <ActionButton
        secondary
        onPress={() =>
          void signOut().catch(() => setMessage('로그아웃하지 못했어요. 다시 시도해주세요.'))
        }
      >
        로그아웃
      </ActionButton>
      <ActionButton
        secondary
        danger
        disabled={!workspaceId || lastOwner || leaving}
        onPress={() => {
          setConfirmDelete(false);
          setConfirmLeave(true);
        }}
      >
        현재 밴드 탈퇴
      </ActionButton>
      {lastOwner ? <Meta>탈퇴하려면 다른 멤버를 먼저 Owner로 지정해주세요.</Meta> : null}
      {confirmLeave ? (
        <>
          <Meta>이 밴드의 공유 자료 접근 권한을 잃게 됩니다. 탈퇴할까요?</Meta>
          {members.length === 1 && (
            <Meta>
              멤버가 없으면 밴드 공간도 지워집니다. 모든 관련 데이터가 영구 삭제되며 복구할 수
              없습니다.
            </Meta>
          )}
          <ActionButton
            danger
            disabled={leaving || lastOwner}
            onPress={() => {
              if (members.length === 1 && !confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              setLeaving(true);
              void leaveWorkspace(confirmDelete)
                .then(() => {
                  setConfirmLeave(false);
                  setMessage('밴드에서 탈퇴했습니다.');
                })
                .catch((error: Error) => setMessage(error.message))
                .finally(() => setLeaving(false));
            }}
          >
            {leaving ? '탈퇴 중…' : confirmDelete ? '모든 데이터 삭제 및 탈퇴' : '탈퇴 확인'}
          </ActionButton>
          <ActionButton secondary disabled={leaving} onPress={() => setConfirmLeave(false)}>
            취소
          </ActionButton>
        </>
      ) : null}
      {message ? <Meta>{message}</Meta> : null}
    </Surface>
  );
}
