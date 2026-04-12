import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';

export enum SavingsDurationDto {
  ONE_YEAR = 'ONE_YEAR',
  TWO_YEARS = 'TWO_YEARS',
  UNTIL_GRADUATION = 'UNTIL_GRADUATION',
}

export enum SavingsFrequencyDto {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM',
}

export enum SavingsPaymentMethodDto {
  WALLET = 'WALLET',
  CARD = 'CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export class CreateSavingsDto {
  @IsString()
  @IsNotEmpty()
  academicLevel: string; // "100" | "200" | "300" | "400" | "500"

  @IsInt()
  @Min(2024)
  @Max(2040)
  expectedGradYear: number;

  @IsEnum(SavingsDurationDto)
  duration: SavingsDurationDto;

  @IsNumber()
  @Min(100)
  contributionAmount: number;

  @IsEnum(SavingsFrequencyDto)
  frequency: SavingsFrequencyDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(31)
  preferredDay?: number;

  @IsOptional()
  @IsString()
  preferredTime?: string; // "HH:mm"

  @IsOptional()
  @IsNumber()
  savingsTarget?: number;

  @IsOptional()
  @IsString()
  rentalLocation?: string;

  @IsEnum(SavingsPaymentMethodDto)
  paymentMethod: SavingsPaymentMethodDto;

  @IsOptional()
  @IsString()
  planName?: string;

  @IsOptional()
  @IsString()
  dreamHousePhoto?: string;
}
