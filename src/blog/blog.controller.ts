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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { BlogGuard } from 'src/guards/blog.guard';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@ApiTags('blog')
@Controller()
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // ── Public ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get published blog posts' })
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

  @ApiOperation({ summary: 'Get a published post by slug' })
  @Get('blog/:slug')
  getPublishedPostBySlug(@Param('slug') slug: string) {
    return this.blogService.getPublishedPostBySlug(slug);
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all posts (admin view)' })
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

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a post by ID (admin view)' })
  @Get('a/blog/:id')
  @UseGuards(JwtAuthGuard, BlogGuard)
  getAdminPostById(@Param('id') id: string) {
    return this.blogService.getAdminPostById(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new blog post' })
  @ApiBody({ type: CreatePostDto })
  @Post('a/blog')
  @UseGuards(JwtAuthGuard, BlogGuard)
  @HttpCode(HttpStatus.CREATED)
  createPost(@Body() dto: CreatePostDto, @Request() req) {
    return this.blogService.createPost(req.user.id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a blog post' })
  @ApiBody({ type: UpdatePostDto })
  @Patch('a/blog/:id')
  @UseGuards(JwtAuthGuard, BlogGuard)
  updatePost(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.blogService.updatePost(id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish a blog post' })
  @Patch('a/blog/:id/publish')
  @UseGuards(JwtAuthGuard, BlogGuard)
  publishPost(@Param('id') id: string) {
    return this.blogService.publishPost(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unpublish a blog post' })
  @Patch('a/blog/:id/unpublish')
  @UseGuards(JwtAuthGuard, BlogGuard)
  unpublishPost(@Param('id') id: string) {
    return this.blogService.unpublishPost(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a blog post' })
  @Delete('a/blog/:id')
  @UseGuards(JwtAuthGuard, BlogGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePost(@Param('id') id: string) {
    return this.blogService.deletePost(id);
  }
}
