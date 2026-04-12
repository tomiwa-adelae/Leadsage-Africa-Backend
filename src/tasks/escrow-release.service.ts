import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';

@Injectable()
export class EscrowReleaseService {
  private readonly logger = new Logger(EscrowReleaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  /** Run every 15 minutes — release escrows whose hold period has passed */
  @Cron('*/15 * * * *')
  async releaseMaturedEscrows() {
    const due = await this.prisma.paymentEscrow.findMany({
      where: {
        status: 'HOLDING',
        releaseAt: { lte: new Date() },
      },
      select: { id: true, landlordId: true, netAmount: true, type: true },
    });

    if (due.length === 0) return;

    this.logger.log(`Releasing ${due.length} matured escrow(s)`);

    for (const escrow of due) {
      try {
        await this.wallet.releaseEscrow(escrow.id);

        // Notify landlord
        await this.prisma.notification.create({
          data: {
            userId: escrow.landlordId,
            type: 'GENERAL',
            title: 'Payment credited to your wallet',
            body: `₦${escrow.netAmount.toLocaleString()} has been released to your Leadsage wallet.`,
            data: { escrowId: escrow.id },
          },
        });
      } catch (err) {
        this.logger.error(`Failed to release escrow ${escrow.id}: ${err}`);
      }
    }

    this.logger.log(`Released ${due.length} escrow(s)`);
  }
}
