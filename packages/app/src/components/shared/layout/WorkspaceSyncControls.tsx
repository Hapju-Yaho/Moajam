import { HoverTitle } from '@component/shared/ui/HoverTitle';
import { withPressFeedback } from '@component/shared/ui/withPressFeedback';
import styledNative from '@emotion/native';
import { useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useMockAppState } from '@state/MockAppState';
import {
  ActionButton,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  Surface,
} from '@component/shared/ui/ProductUI';
import { ScheduleDialog } from '@component/shared/ui/ScheduleDialog';
import { AppIcon } from '@component/shared/icons';

export function WorkspaceSyncControls({ children }: PropsWithChildren) {
  const { syncStatus, serverConfigured, reloadRemote } = useMockAppState();
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const failed = syncStatus.includes('실패');
  const description = `${reloading ? '서버 기록 불러오는 중' : '서버 기록 새로 불러오기'} · ${syncStatus}`;
  const reload = async () => {
    if (pending.current) return;
    pending.current = true;
    setReloading(true);
    setError('');
    try {
      await reloadRemote();
      setConfirmReload(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '서버 기록을 불러오지 못했어요. 다시 시도해주세요.',
      );
    } finally {
      pending.current = false;
      setReloading(false);
    }
  };
  const close = () => {
    if (!pending.current) setConfirmReload(false);
  };
  const button = serverConfigured ? (
    <WorkspaceSyncControlsButton2
      accessibilityRole="button"
      accessibilityLabel={description}
      accessibilityState={{ disabled: reloading, busy: reloading, expanded: confirmReload }}
      disabled={reloading}
      onPress={() => {
        setError('');
        setConfirmReload(true);
      }}
      $confirmReload={confirmReload}
    >
      {reloading ? (
        <ActivityIndicator size="small" color="#386ce4" />
      ) : (
        <AppIcon name="refresh" size={20} color={failed ? '#be3b4b' : '#566b8c'} />
      )}
      {failed && <WorkspaceSyncControlsContainer />}
    </WorkspaceSyncControlsButton2>
  ) : null;
  const control = button ? <HoverTitle title={description}>{button}</HoverTitle> : null;
  return (
    <>
      {children ? (
        <WorkspaceSyncControlsRow wrap>
          {children}
          {control}
        </WorkspaceSyncControlsRow>
      ) : (
        control
      )}
      <ScheduleDialog
        visible={serverConfigured && confirmReload}
        onClose={close}
        label="서버 기록 새로 불러오기"
      >
        <WorkspaceSyncControlsContainer2>
          <WorkspaceSyncControlsButton accessibilityLabel="새로 불러오기 창 닫기" onPress={close} />
          <WorkspaceSyncControlsPanel scrollable>
            <Heading>서버 기록을 새로 불러올까요?</Heading>
            <Meta accessibilityLiveRegion="polite">{syncStatus}</Meta>
            <Meta>
              현재 화면의 밴드 데이터를 서버 기록으로 교체해요. 아직 저장되지 않은 변경 사항이
              있다면 먼저 확인해주세요.
            </Meta>
            {!!error && (
              <WorkspaceSyncControlsMeta accessibilityRole="alert">
                {error}
              </WorkspaceSyncControlsMeta>
            )}
            <FlexBetween>
              <ActionButton secondary disabled={reloading} onPress={close}>
                취소
              </ActionButton>
              <ActionButton disabled={reloading} onPress={() => void reload()}>
                {reloading ? '불러오는 중…' : '새로 불러오기'}
              </ActionButton>
            </FlexBetween>
          </WorkspaceSyncControlsPanel>
        </WorkspaceSyncControlsContainer2>
      </ScheduleDialog>
    </>
  );
}

const WorkspaceSyncControlsContainer = styledNative(View)({
  position: 'absolute',
  top: 5,
  right: 5,
  width: 6,
  height: 6,
  borderTopLeftRadius: 3,
  borderTopRightRadius: 3,
  borderBottomRightRadius: 3,
  borderBottomLeftRadius: 3,
  backgroundColor: '#be3b4b',
});

const WorkspaceSyncControlsRow = styledNative(FlexRow)({ justifyContent: 'space-between' });

const WorkspaceSyncControlsContainer2 = styledNative(View)({
  flex: 1,
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(16,29,53,0.48)',
});

const WorkspaceSyncControlsButton = styledNative(Pressable)({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

const WorkspaceSyncControlsPanel = styledNative(Surface)({ width: '100%', maxWidth: 420 });

const WorkspaceSyncControlsMeta = styledNative(Meta)({ color: '#be3b4b' });

const WorkspaceSyncControlsButton2 = withPressFeedback(
  styledNative(Pressable, {
    shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
  })<{ $pressed: boolean; $confirmReload: boolean }>(({ $pressed, $confirmReload }) => ({
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: $pressed || $confirmReload ? '#edf3ff' : '#f6f8fb',
  })),
);
