import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

export enum PostCategoryDto {
  NEWS = 'NEWS',
  BLOG = 'BLOG',
  LIFESTYLE = 'LIFESTYLE',
  GUIDES = 'GUIDES',
  EVENTS = 'EVENTS',
  OTHER = 'OTHER',
}

export class CreatePostDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsEnum(PostCategoryDto)
  category?: PostCategoryDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
