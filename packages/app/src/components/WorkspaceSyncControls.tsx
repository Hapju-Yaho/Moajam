import { useState, type PropsWithChildren } from 'react';
import { useMockAppState } from '../state/MockAppState';
import { ActionButton, FlexRow, Meta, Surface } from './ProductUI';

export function WorkspaceSyncControls({ children }: PropsWithChildren) {
  const { syncStatus, serverConfigured, reloadRemote } = useMockAppState();
  const [confirmReload, setConfirmReload] = useState(false);
  if (!serverConfigured && !children) return null;
  return (
    <>
      <FlexRow wrap gap={12} style={{ width: '100%', justifyContent: 'space-between' }}>
        {children}
        {serverConfigured && (
          <FlexRow wrap style={{ marginLeft: children ? 'auto' : 0, justifyContent: 'flex-end' }}>
            <Meta numberOfLines={1} accessibilityLiveRegion="polite">
              {syncStatus}
            </Meta>
            <ActionButton secondary compact onPress={() => setConfirmReload(true)}>
              서버 기록 새로 불러오기
            </ActionButton>
          </FlexRow>
        )}
      </FlexRow>
      {serverConfigured && confirmReload && (
        <Surface>
          <Meta>
            저장되지 않은 화면 변경을 서버 기록으로 교체합니다. 필요한 기록은 설정에서 먼저
            백업해주세요.
          </Meta>
          <FlexRow>
            <ActionButton secondary onPress={() => setConfirmReload(false)}>
              취소
            </ActionButton>
            <ActionButton
              onPress={() => {
                setConfirmReload(false);
                void reloadRemote().catch(() => {});
              }}
            >
              서버 기록으로 교체
            </ActionButton>
          </FlexRow>
        </Surface>
      )}
    </>
  );
}
