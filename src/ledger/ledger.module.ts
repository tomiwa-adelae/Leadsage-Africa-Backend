import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';

@Module({
  controllers: [LedgerController],
  providers: [LedgerService, PrismaService],
  exports: [LedgerService],
})
export class LedgerModule {}
