import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SavingsService } from 'src/savings/savings.service';

@Injectable()
export class SavingsCronService {
  private readonly logger = new Logger(SavingsCronService.name);

  constructor(private readonly savings: SavingsService) {}

  // Run at 00:05 daily — apply interest to all active plans
  @Cron('5 0 * * *')
  async applyDailyInterest() {
    this.logger.log('Running daily interest cron');
    await this.savings.applyDailyInterest();
  }

  // Run at 09:00 daily — process wallet auto-contributions
  @Cron('0 9 * * *')
  async processContributions() {
    this.logger.log('Running scheduled contributions cron');
    await this.savings.processScheduledContributions();
  }

  // Run at 00:10 daily — mature plans that have hit their end date
  @Cron('10 0 * * *')
  async maturePlans() {
    this.logger.log('Running plan maturity cron');
    await this.savings.maturePlans();
  }
}
