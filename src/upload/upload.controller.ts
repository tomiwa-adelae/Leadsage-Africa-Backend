import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('profile/:userId')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadProfilePicture(
    @UploadedFile() file: Express.Multer.File,
    @Param('userId') userId: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype))
      throw new BadRequestException('Only JPEG, PNG, or WEBP images are allowed');
    return this.uploadService.uploadProfilePicture(userId, file);
  }

  @Post('event-cover')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadEventCover(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype))
      throw new BadRequestException('Only JPEG, PNG, or WEBP images are allowed');
    const url = await this.uploadService.uploadEventCover(file);
    return { url };
  }
}
