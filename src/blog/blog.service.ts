import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import slugify from 'slugify';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class BlogService {
  constructor(private prisma: PrismaService) {}

  private async generateUniqueSlug(
    title: string,
    excludeId?: string,
  ): Promise<string> {
    let base = slugify(title, { lower: true, strict: true });
    let slug = base;
    let counter = 1;
    while (true) {
      const existing = await this.prisma.post.findUnique({ where: { slug } });
      if (!existing || existing.id === excludeId) break;
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  async createPost(authorId: string, dto: CreatePostDto) {
    const slug = await this.generateUniqueSlug(dto.title);
    return this.prisma.post.create({
      data: {
        title: dto.title,
        slug,
        excerpt: dto.excerpt ?? null,
        body: dto.body,
        coverImage: dto.coverImage ?? null,
        category: dto.category ?? 'OTHER',
        status: 'DRAFT',
        tags: dto.tags ?? [],
        authorId,
      },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
  }

  async updatePost(id: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');

    const slug =
      dto.title && dto.title !== post.title
        ? await this.generateUniqueSlug(dto.title, id)
        : post.slug;

    return this.prisma.post.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title, slug }),
        ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
        ...(dto.body && { body: dto.body }),
        ...(dto.coverImage !== undefined && { coverImage: dto.coverImage }),
        ...(dto.category && { category: dto.category }),
        ...(dto.tags && { tags: dto.tags }),
      },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
  }

  async publishPost(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return this.prisma.post.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
  }

  async unpublishPost(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return this.prisma.post.update({
      where: { id },
      data: { status: 'DRAFT' },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
  }

  async deletePost(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.post.delete({ where: { id } });
  }

  async getAdminPosts(query: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { author: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    return { total, page, limit, data };
  }

  async getAdminPostById(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  async getPublishedPosts(query: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 12;
    const skip = (page - 1) * limit;

    const where: any = { status: 'PUBLISHED' };
    if (query.category) where.category = query.category;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          coverImage: true,
          category: true,
          tags: true,
          publishedAt: true,
          author: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    return { total, page, limit, data };
  }

  async getPublishedPostBySlug(slug: string) {
    const post = await this.prisma.post.findUnique({
      where: { slug },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    if (!post || post.status !== 'PUBLISHED')
      throw new NotFoundException('Post not found');
    return post;
  }
}
