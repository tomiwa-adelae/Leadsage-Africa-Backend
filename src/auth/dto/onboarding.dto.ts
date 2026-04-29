import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class OnboardingDto {
  // ── Personal info ────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  // ── Location ─────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // ── CLIENT — renter preferences ──────────────────────────────────────────
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredPropertyTypes?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMax?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredAreas?: string[];

  @IsOptional()
  @IsString()
  moveInTimeline?: string;

  // ── LANDLORD — property details ───────────────────────────────────────────
  @IsOptional()
  @IsBoolean()
  hasExistingProperty?: boolean;

  @IsOptional()
  @IsString()
  propertyCount?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  managedPropertyTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  operatingAreas?: string[];

  // ── LANDLORD — NIN verification ───────────────────────────────────────────
  @IsOptional()
  @IsString()
  nin?: string;

  @IsOptional()
  @IsBoolean()
  ninVerified?: boolean;
}
