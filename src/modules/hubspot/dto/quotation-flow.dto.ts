import { IsNumber, IsEnum } from 'class-validator';

export enum QuotationFlowType {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export class QuotationFlow {
  @IsNumber()
  dealId: number;

  @IsNumber()
  amount: number;

  @IsEnum(QuotationFlowType)
  quationFlow: QuotationFlowType;
}
