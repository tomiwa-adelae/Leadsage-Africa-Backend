import { IsString, MinLength } from 'class-validator';

export class SignAgreementDto {
  /** Typed full name as the e-signature */
  @IsString()
  @MinLength(3)
  signature: string;
}
