import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum ListingTypeDto {
  LONG_TERM = 'long-term',
  SHORTLET = 'shortlet',
  OFFICE_SPACE = 'office-space',
  HOTEL_ROOM = 'hotel-room',
}

export enum PropertyCategoryDto {
  APARTMENT = 'apartment',
  DUPLEX = 'duplex',
  BUNGALOW = 'bungalow',
  TERRACED = 'terraced',
  SEMI_DETACHED = 'semi-detached',
  DETACHED = 'detached',
  MANSION = 'mansion',
  STUDIO = 'studio',
  PENTHOUSE = 'penthouse',
  OFFICE = 'office',
  HOTEL_ROOM = 'hotel-room',
}

export enum FurnishedStatusDto {
  FURNISHED = 'furnished',
  SEMI_FURNISHED = 'semi-furnished',
  UNFURNISHED = 'unfurnished',
}

export enum PaymentFrequencyDto {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  BI_ANNUALLY = 'bi-annually',
  ANNUALLY = 'annually',
}

export class CreateListingDto {
  // Step 1
  @IsEnum(ListingTypeDto)
  listingType: ListingTypeDto;

  // Step 2
  @IsString()
  @MinLength(10)
  @MaxLength(100)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  summary?: string;

  @IsString()
  @IsNotEmpty()
  description: string; // TipTap JSON string

  // Step 3
  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  lga: string;

  @IsString()
  @IsNotEmpty()
  area: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  // Step 4
  @IsEnum(PropertyCategoryDto)
  propertyCategory: PropertyCategoryDto;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bedrooms: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  bathrooms: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  toilets: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sizeInSqm?: number;

  @IsEnum(FurnishedStatusDto)
  furnished: FurnishedStatusDto;

  // Step 5 — long-term / office
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

  // Step 5 — shortlet / hotel
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

  // Step 6
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  amenities: string[];

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  petFriendly: boolean;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  smokingAllowed: boolean;

  @IsString()
  @IsNotEmpty()
  availableFrom: string; // ISO date string — converted to DateTime in service
}
