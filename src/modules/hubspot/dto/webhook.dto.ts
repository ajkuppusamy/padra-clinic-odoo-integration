import { IsNumber, IsString, IsNotEmpty } from 'class-validator';

export class HubspotWebhookDto {
  @IsNumber()
  appId: number;

  @IsNumber()
  eventId: number;

  @IsNumber()
  subscriptionId: number;

  @IsNumber()
  portalId: number;

  @IsNumber()
  occurredAt: number;

  @IsString()
  subscriptionType: string;

  @IsNumber()
  attemptNumber: number;

  @IsNotEmpty()
  @IsNumber()
  objectId: number | string;

  @IsString()
  changeSource: string;

  @IsString()
  propertyName: string;

  @IsString()
  propertyValue: string;

  @IsString()
  objectType: string;

  @IsString()
  objectTypeId: string;

  @IsString()
  changeFlag?: string; // DELETED, UPDATED, etc.
}
