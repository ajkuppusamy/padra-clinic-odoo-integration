import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as HubspotClient } from '@hubspot/api-client';
import { SimplePublicObjectInput } from '@hubspot/api-client/lib/codegen/crm/companies';
import { CollectionResponseMultiAssociatedObjectWithLabelForwardPaging } from '@hubspot/api-client/lib/codegen/crm/associations/v4';
import { HubspotObjects } from '@common/enums';

@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);
  private readonly hubspotClient: HubspotClient;

  constructor(private readonly configService: ConfigService) {
    this.hubspotClient = new HubspotClient({
      accessToken: this.configService.get<string>('HUBSPOT_API_KEY', ''),
    });
  }

  async getHubspotObjectData<T>(
    objectType: HubspotObjects,
    objectId: string,
    properties: string[] = [],
  ): Promise<T | null> {
    this.logger.debug(`Fetching Hubspot object ${objectType}, id ${objectId}`);
    const response = await this.hubspotClient.crm.objects.basicApi.getById(
      objectType,
      objectId,
      properties,
    );
    return response as T;
  }

  async updateHubspotObject(
    objectType: HubspotObjects,
    objectId: string,
    properties: SimplePublicObjectInput['properties'],
  ): Promise<void> {
    try {
      await this.hubspotClient.crm.objects.basicApi.update(
        objectType,
        objectId,
        { properties },
      );

      this.logger.log(
        `Successfully updated ${objectType} (ID: ${objectId}) with: ${JSON.stringify(
          properties,
        )}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update ${objectType} (ID: ${objectId}): ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  async getHubspotAssociations(
    fromObjectType: HubspotObjects,
    fromObjectId: string,
    toObjectType: HubspotObjects,
  ): Promise<
    CollectionResponseMultiAssociatedObjectWithLabelForwardPaging['results']
  > {
    const allResults: CollectionResponseMultiAssociatedObjectWithLabelForwardPaging['results'] =
      [];
    let after: string | undefined;
    const limit = 100;

    try {
      do {
        const response =
          await this.hubspotClient.crm.associations.v4.basicApi.getPage(
            fromObjectType,
            fromObjectId,
            toObjectType,
            after,
            limit,
          );

        allResults.push(...(response.results || []));
        after = response.paging?.next?.after;
      } while (after);

      return allResults;
    } catch (error) {
      this.logger.error(
        `Failed to fetch associations from ${fromObjectType} (${fromObjectId}) to ${toObjectType}: ${error?.message}`,
        error?.stack,
      );
      return [];
    }
  }
}
