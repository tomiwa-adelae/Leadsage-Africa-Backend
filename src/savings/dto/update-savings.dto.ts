import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { SavingsFrequencyDto, SavingsPaymentMethodDto } from './create-savings.dto';

export class UpdateSavingsDto {
  @IsOptional()
  @IsString()
  academicLevel?: string;

  @IsOptional()
  @IsInt()
  @Min(2024)
  @Max(2040)
  expectedGradYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  contributionAmount?: number;

  @IsOptional()
  @IsEnum(SavingsFrequencyDto)
  frequency?: SavingsFrequencyDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(31)
  preferredDay?: number;

  @IsOptional()
  @IsString()
  preferredTime?: string;

  @IsOptional()
  @IsNumber()
  savingsTarget?: number;

  @IsOptional()
  @IsString()
  rentalLocation?: string;

  @IsOptional()
  @IsEnum(SavingsPaymentMethodDto)
  paymentMethod?: SavingsPaymentMethodDto;

  @IsOptional()
  @IsString()
  planName?: string;

  @IsOptional()
  @IsString()
  dreamHousePhoto?: string;
}
