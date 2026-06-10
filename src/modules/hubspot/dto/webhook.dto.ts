import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';

export enum SubscriptionType {
  DEAL_CREATION = 'deal.creation',
  DEAL_DELETION = 'deal.deletion',
  DEAL_PROPERTY_CHANGE = 'deal.propertyChange',
  CONTACT_PROPERTY_CHANGE = 'contact.propertyChange',
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
    required: false,
    description: 'HubSpot App ID',
    example: 123456,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  @IsOptional()
  appId?: number;

  @ApiProperty({
    required: false,
    description: 'Unique event identifier',
    example: 987654323,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  @IsOptional()
  eventId?: number;

  @ApiProperty({
    required: false,
    description: 'Webhook subscription ID',
    example: 456790,
    type: Number,
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  subscriptionId?: number;

  @ApiProperty({
    required: false,
    description: 'HubSpot portal/account ID',
    example: 12345678,
    type: Number,
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  portalId?: number;
  @ApiProperty({
    required: false,
    description: 'Event timestamp (milliseconds since epoch)',
    example: 1702541000000,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  @IsOptional()
  occurredAt?: number;

  @ApiProperty({
    required: false,
    description: 'Type of subscription event',
    enum: SubscriptionType,
    example: SubscriptionType.DEAL_CREATION,
  })
  @IsEnum(SubscriptionType)
  @IsNotEmpty()
  @IsOptional()
  subscriptionType?: SubscriptionType;

  @ApiProperty({
    required: false,
    description: 'Retry attempt number',
    example: 0,
    type: Number,
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  attemptNumber?: number;

  @ApiProperty({
    required: true,
    description: 'ID of the affected object (deal, contact, etc.)',
    example: 5001,
    type: Number,
  })
  @IsNumber()
  @IsOptional()
  @IsNotEmpty()
  objectId?: number;

  @ApiProperty({
    required: false,
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
    required: false,
    description: 'Type of object affected',
    enum: ObjectType,
    example: ObjectType.DEAL,
  })
  @IsEnum(ObjectType)
  @IsNotEmpty()
  @IsOptional()
  objectType?: ObjectType;

  @ApiProperty({
    required: false,
    description: 'HubSpot object type ID',
    example: '0-3',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  objectTypeId?: string;

  @ApiProperty({
    required: false,
    description: 'Indicates what action occurred',
    enum: ChangeFlag,
    example: ChangeFlag.CREATED,
  })
  @IsEnum(ChangeFlag)
  @IsOptional()
  changeFlag?: ChangeFlag;
}
