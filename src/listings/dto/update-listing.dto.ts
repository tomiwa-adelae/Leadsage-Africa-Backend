import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  FurnishedStatusDto,
  PaymentFrequencyDto,
  PropertyCategoryDto,
} from './create-listing.dto';

export class UpdateListingDto {
  // Basic Info
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Location
  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  lga?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Property Details
  @IsOptional()
  @IsEnum(PropertyCategoryDto)
  propertyCategory?: PropertyCategoryDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  bathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  toilets?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sizeInSqm?: number;

  @IsOptional()
  @IsEnum(FurnishedStatusDto)
  furnished?: FurnishedStatusDto;

  // Pricing — long-term
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pricePerYear?: number;

  @IsOptional()
  @IsEnum(PaymentFrequencyDto)
  paymentFrequency?: PaymentFrequencyDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cautionFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  serviceCharge?: number;

  // Pricing — shortlet / hotel
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pricePerNight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minimumNights?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  instantBook?: boolean;

  // Amenities & Rules
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  amenities?: string[];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  petFriendly?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  smokingAllowed?: boolean;

  @IsOptional()
  @IsString()
  availableFrom?: string;

  // Photos — JSON array of existing URLs to keep
  @IsOptional()
  @IsString()
  keepPhotos?: string; // JSON.stringify(string[])
}
