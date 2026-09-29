import { useState } from 'react';
import { View } from 'react-native';
import { useMockAppState, useWorkspaceValue } from '../../state/MockAppState';
import { Input } from '../../styles/layout';
import {
  ActionButton,
  CheckItem,
  FlexRow,
  Heading,
  Meta,
  Pill,
  PillText,
  Surface,
} from '../ProductUI';
export type SongCheck = {
  id: string;
  label: string;
  done: boolean;
  assigneeId?: string;
  sourceOpinionId?: string;
};
export function SongChecks({ songId }: { songId: string }) {
  const { members, currentUserId } = useMockAppState();
  const [checks, setChecks] = useWorkspaceValue<SongCheck[]>(`song/${songId}/checks`, []);
  const [draft, setDraft] = useState('');
  const [assignee, setAssignee] = useState(currentUserId);
  const [filter, setFilter] = useState('남은 일');
  const [assigning, setAssigning] = useState<string | null>(null);
  const visible = checks.filter(
    (item) =>
      filter === '전체' ||
      (filter === '완료'
        ? item.done
        : !item.done && (filter !== '내 할 일' || item.assigneeId === currentUserId)),
  );
  return (
    <Surface>
      <Heading>다음 합주까지 할 일</Heading>
      <Meta>
        {checks.filter((item) => item.done).length} / {checks.length} 완료 · 의견에서 결정한 내용도
        이곳에서 준비해요.
      </Meta>
      <FlexRow wrap>
        {['남은 일', '내 할 일', '완료', '전체'].map((value) => (
          <Pill
            key={value}
            accessibilityRole="button"
            active={filter === value}
            onPress={() => setFilter(value)}
          >
            <PillText active={filter === value}>{value}</PillText>
          </Pill>
        ))}
      </FlexRow>
      {visible.map((item) => (
        <View
          key={item.id}
          style={{ gap: 8, borderTopWidth: 1, borderTopColor: '#edf1f6', paddingTop: 12 }}
        >
          <CheckItem
            label={item.label}
            checked={item.done}
            onPress={() =>
              setChecks((all) =>
                all.map((row) => (row.id === item.id ? { ...row, done: !row.done } : row)),
              )
            }
          />
          <FlexRow wrap>
            <Meta>
              {members.find((member) => member.id === item.assigneeId)?.name ?? '담당자 미지정'}
              {item.sourceOpinionId ? ' · 의견에서 연결됨' : ''}
            </Meta>
            <ActionButton
              secondary
              compact
              onPress={() => setAssigning(assigning === item.id ? null : item.id)}
            >
              담당자 변경
            </ActionButton>
            <ActionButton
              secondary
              compact
              onPress={() => setChecks((all) => all.filter((row) => row.id !== item.id))}
            >
              항목 삭제
            </ActionButton>
          </FlexRow>
          {assigning === item.id && (
            <FlexRow wrap>
              {[{ id: '', name: '미지정' }, ...members].map((member) => (
                <ActionButton
                  key={member.id}
                  secondary
                  compact
                  onPress={() => {
                    setChecks((all) =>
                      all.map((row) =>
                        row.id === item.id ? { ...row, assigneeId: member.id } : row,
                      ),
                    );
                    setAssigning(null);
                  }}
                >
                  {member.name}
                </ActionButton>
              ))}
            </FlexRow>
          )}
        </View>
      ))}
      {!visible.length && <Meta>이 조건에 해당하는 할 일이 없어요.</Meta>}
      <Input
        accessibilityLabel="할 일 내용"
        multiline
        style={{ minHeight: 76, textAlignVertical: 'top' }}
        placeholder="예: 2절 코러스 화음 맞추기"
        value={draft}
        onChangeText={setDraft}
        maxLength={2000}
      />
      <Meta>새 할 일 담당자</Meta>
      <FlexRow wrap>
        {[{ id: '', name: '미지정' }, ...members].map((member) => (
          <Pill
            key={member.id}
            accessibilityRole="button"
            active={assignee === member.id}
            onPress={() => setAssignee(member.id)}
          >
            <PillText active={assignee === member.id}>{member.name}</PillText>
          </Pill>
        ))}
      </FlexRow>
      <ActionButton
        disabled={!draft.trim()}
        onPress={() => {
          setChecks((all) => [
            ...all,
            { id: `check-${Date.now()}`, label: draft.trim(), done: false, assigneeId: assignee },
          ]);
          setDraft('');
          setFilter('남은 일');
        }}
      >
        할 일 추가
      </ActionButton>
    </Surface>
  );
}
