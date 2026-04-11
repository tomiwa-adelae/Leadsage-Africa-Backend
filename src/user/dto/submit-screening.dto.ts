import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class SubmitScreeningDto {
  /** The listing this application is for */
  @IsUUID()
  listingId: string;

  /** Optional: link back to the tour that preceded this application */
  @IsOptional()
  @IsUUID()
  tourRequestId?: string;

  // ── Tenancy intent ──────────────────────────────────────────────────────

  @IsOptional()
  @IsDateString()
  moveInDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  tenancyMonths?: number;

  @IsOptional()
  @IsString()
  reasonForMoving?: string;

  // ── Identity ────────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  nin?: string;

  // ── Employment ──────────────────────────────────────────────────────────

  @IsOptional()
  @IsIn(['employed', 'self-employed', 'student', 'unemployed'])
  employmentStatus?: string;

  @IsOptional()
  @IsString()
  employer?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyIncome?: number;

  @IsOptional()
  @IsString()
  employmentDocUrl?: string;

  // ── References ──────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  ref1Name?: string;

  @IsOptional()
  @IsString()
  ref1Phone?: string;

  @IsOptional()
  @IsString()
  ref1Relation?: string;

  @IsOptional()
  @IsString()
  ref2Name?: string;

  @IsOptional()
  @IsString()
  ref2Phone?: string;

  @IsOptional()
  @IsString()
  ref2Relation?: string;

  // ── Introductory message ────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  message?: string;
}
