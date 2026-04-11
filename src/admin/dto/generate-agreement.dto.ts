import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class GenerateAgreementDto {
  @IsUUID()
  applicationId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(0)
  monthlyRent: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cautionFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceCharge?: number;
}
