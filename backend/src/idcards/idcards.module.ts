import { Module } from '@nestjs/common';
import { IdCardsController } from './idcards.controller';
import { IdCardsService } from './idcards.service';

@Module({
  controllers: [IdCardsController],
  providers: [IdCardsService],
  exports: [IdCardsService],
})
export class IdCardsModule {}
