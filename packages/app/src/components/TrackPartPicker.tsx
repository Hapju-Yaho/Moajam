import { trackParts, type TrackPart } from '../lib/trackParts';
import { FlexRow, Pill, PillText } from './ProductUI';

export function TrackPartPicker({
  value,
  onChange,
  disabled,
}: {
  value: TrackPart;
  onChange: (part: TrackPart) => void;
  disabled?: boolean;
}) {
  return (
    <FlexRow wrap>
      {trackParts.map((part) => (
        <Pill
          key={part.value}
          accessibilityRole="button"
          accessibilityLabel={`${part.label} 트랙`}
          accessibilityState={{ selected: value === part.value, disabled }}
          active={value === part.value}
          disabled={disabled}
          onPress={() => onChange(part.value)}
        >
          <PillText active={value === part.value}>{part.label}</PillText>
        </Pill>
      ))}
    </FlexRow>
  );
}
