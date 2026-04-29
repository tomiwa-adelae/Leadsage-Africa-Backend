import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @ApiOperation({ summary: 'Upload a profile picture (max 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @Post('profile/:userId')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadProfilePicture(
    @UploadedFile() file: Express.Multer.File,
    @Param('userId') userId: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype))
      throw new BadRequestException(
        'Only JPEG, PNG, or WEBP images are allowed',
      );
    return this.uploadService.uploadProfilePicture(userId, file);
  }

  @ApiOperation({ summary: 'Upload an event cover image (max 10 MB)' })
  @ApiConsumes('multipart/form-data')
  @Post('event-cover')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadEventCover(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype))
      throw new BadRequestException(
        'Only JPEG, PNG, or WEBP images are allowed',
      );
    const url = await this.uploadService.uploadEventCover(file);
    return { url };
  }

  @ApiOperation({ summary: 'Upload a blog cover image (max 10 MB)' })
  @ApiConsumes('multipart/form-data')
  @Post('blog-cover')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadBlogCover(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype))
      throw new BadRequestException(
        'Only JPEG, PNG, or WEBP images are allowed',
      );
    const url = await this.uploadService.uploadBlogCover(file);
    return { url };
  }

  @ApiOperation({ summary: 'Upload an inline editor image' })
  @ApiConsumes('multipart/form-data')
  @Post('editor-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadEditorImage(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadService.uploadEditorImage(file);
  }
}
