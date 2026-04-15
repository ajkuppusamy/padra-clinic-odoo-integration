import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';

export enum SubscriptionType {
  DEAL_CREATION = 'deal.creation',
  DEAL_DELETION = 'deal.deletion',
  DEAL_PROPERTY_CHANGE = 'deal.propertyChange',
}

export enum ChangeFlag {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  DELETED = 'DELETED',
}

export enum ChangeSource {
  CRM_UI = 'CRM_UI',
  API = 'API',
  WORKFLOWS = 'WORKFLOWS',
  IMPORT = 'IMPORT',
}

export enum ObjectType {
  DEAL = 'DEAL',
  CONTACT = 'CONTACT',
  COMPANY = 'COMPANY',
  TICKET = 'TICKET',
}

export class HubspotWebhookDto {
  @ApiProperty({
    description: 'HubSpot App ID',
    example: 123456,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  appId!: number;

  @ApiProperty({
    description: 'Unique event identifier',
    example: 987654323,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  eventId!: number;

  @ApiProperty({
    description: 'Webhook subscription ID',
    example: 456790,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  subscriptionId!: number;

  @ApiProperty({
    description: 'HubSpot portal/account ID',
    example: 12345678,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  portalId!: number;

  @ApiProperty({
    description: 'Event timestamp (milliseconds since epoch)',
    example: 1702541000000,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  occurredAt!: number;

  @ApiProperty({
    description: 'Type of subscription event',
    enum: SubscriptionType,
    example: SubscriptionType.DEAL_CREATION,
  })
  @IsEnum(SubscriptionType)
  @IsNotEmpty()
  subscriptionType!: SubscriptionType;

  @ApiProperty({
    description: 'Retry attempt number',
    example: 0,
    type: Number,
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  attemptNumber?: number;

  @ApiProperty({
    description: 'ID of the affected object (deal, contact, etc.)',
    example: 5001,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  objectId!: number;

  @ApiProperty({
    description: 'Source of the change',
    enum: ChangeSource,
    example: ChangeSource.CRM_UI,
  })
  @IsEnum(ChangeSource)
  @IsOptional()
  changeSource?: ChangeSource;

  @ApiProperty({
    description: 'Name of the property that changed (for propertyChange events)',
    example: 'dealname',
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  propertyName?: string;

  @ApiProperty({
    description: 'New value of the property (for propertyChange events)',
    example: 'Enterprise Software License - ABC Corp',
    required: false,
    type: String,
  })
  @IsString()
  @IsOptional()
  propertyValue?: string;

  @ApiProperty({
    description: 'Type of object affected',
    enum: ObjectType,
    example: ObjectType.DEAL,
  })
  @IsEnum(ObjectType)
  @IsNotEmpty()
  objectType!: ObjectType;

  @ApiProperty({
    description: 'HubSpot object type ID',
    example: '0-3',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  objectTypeId!: string;

  @ApiProperty({
    description: 'Indicates what action occurred',
    enum: ChangeFlag,
    example: ChangeFlag.CREATED,
  })
  @IsEnum(ChangeFlag)
  @IsOptional()
  changeFlag?: ChangeFlag;
}
