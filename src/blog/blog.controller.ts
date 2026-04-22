import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { BlogGuard } from 'src/guards/blog.guard';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Controller()
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // ── Public ──────────────────────────────────────────────────────────────────

  @Get('blog')
  getPublishedPosts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.blogService.getPublishedPosts({
      page,
      limit,
      category,
      search,
    });
  }

  @Get('blog/:slug')
  getPublishedPostBySlug(@Param('slug') slug: string) {
    return this.blogService.getPublishedPostBySlug(slug);
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  @Get('a/blog')
  @UseGuards(JwtAuthGuard, BlogGuard)
  getAdminPosts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: any,
    @Query('search') search?: string,
  ) {
    return this.blogService.getAdminPosts({ page, limit, status, search });
  }

  @Get('a/blog/:id')
  @UseGuards(JwtAuthGuard, BlogGuard)
  getAdminPostById(@Param('id') id: string) {
    return this.blogService.getAdminPostById(id);
  }

  @Post('a/blog')
  @UseGuards(JwtAuthGuard, BlogGuard)
  @HttpCode(HttpStatus.CREATED)
  createPost(@Body() dto: CreatePostDto, @Request() req) {
    return this.blogService.createPost(req.user.id, dto);
  }

  @Patch('a/blog/:id')
  @UseGuards(JwtAuthGuard, BlogGuard)
  updatePost(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.blogService.updatePost(id, dto);
  }

  @Patch('a/blog/:id/publish')
  @UseGuards(JwtAuthGuard, BlogGuard)
  publishPost(@Param('id') id: string) {
    return this.blogService.publishPost(id);
  }

  @Patch('a/blog/:id/unpublish')
  @UseGuards(JwtAuthGuard, BlogGuard)
  unpublishPost(@Param('id') id: string) {
    return this.blogService.unpublishPost(id);
  }

  @Delete('a/blog/:id')
  @UseGuards(JwtAuthGuard, BlogGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePost(@Param('id') id: string) {
    return this.blogService.deletePost(id);
  }
}
