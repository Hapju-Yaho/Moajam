import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';

export const profileParts = ['VOCAL', 'GUITAR', 'BASS', 'DRUMS', 'KEYBOARD', 'OTHER'];
export class OnboardingDto {
  @ApiProperty({ example: '민지', maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
  @ApiProperty({
    description: '선택 항목. 빈 문자열 또는 500KB 이하 PNG/JPEG/WebP base64 data URL',
    example: '',
    maxLength: 700000,
  })
  @IsString()
  @MaxLength(700000)
  photo!: string;
  @ApiProperty({
    enum: profileParts,
    isArray: true,
    minItems: 1,
    maxItems: 6,
    example: ['VOCAL', 'GUITAR'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsIn(profileParts, { each: true })
  parts!: string[];
}
export class OnboardingStateDto {
  @ApiProperty() displayName!: string;
  @ApiProperty({ description: '선택한 프로필 사진 data URL, 미설정 시 빈 문자열' }) photo!: string;
  @ApiProperty({ enum: profileParts, isArray: true, minItems: 0 }) parts!: string[];
  @ApiProperty({ description: '첫 설정을 완료했는지 여부' }) completed!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: string | null;
}
export function validatePhoto(value: unknown) {
  if (value === '') return;
  if (typeof value !== 'string' || value.length > 700000)
    throw new BadRequestException('프로필 사진을 확인해주세요.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new BadRequestException('PNG, JPEG, WebP 사진을 선택해주세요.');
  const bytes = Buffer.from(match[2], 'base64');
  const valid =
    match[1] === 'png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === 'jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!valid || bytes.length > 500 * 1024 || bytes.toString('base64') !== match[2])
    throw new BadRequestException('500KB 이하의 올바른 사진을 선택해주세요.');
}
