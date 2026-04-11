import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class InstallmentDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsDateString()
  dueDate: string;
}

export class CreateRentalPaymentDto {
  @IsUUID()
  applicationId: string;

  @IsOptional()
  @IsUUID()
  agreementId?: string;

  /** Pass a single full amount for one-time payment, or use installments array */
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** For installment plans: array of { amount, dueDate } */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstallmentDto)
  installments?: InstallmentDto[];
}
