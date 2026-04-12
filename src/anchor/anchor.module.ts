import { Global, Module } from '@nestjs/common';
import { AnchorService } from './anchor.service';

@Global()
@Module({
  providers: [AnchorService],
  exports: [AnchorService],
})
export class AnchorModule {}
