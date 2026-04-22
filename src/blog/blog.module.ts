import { Module } from '@nestjs/common';
import { BlogController } from './blog.controller';
import { AuthModule } from 'src/auth/auth.module';
import { BlogService } from './blog.service';
import { BlogGuard } from 'src/guards/blog.guard';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [BlogController],
  providers: [BlogService, BlogGuard, PrismaService],
})
export class BlogModule {}
