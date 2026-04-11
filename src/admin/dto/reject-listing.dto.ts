import { IsNotEmpty, IsString } from 'class-validator';

export class RejectListingDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
