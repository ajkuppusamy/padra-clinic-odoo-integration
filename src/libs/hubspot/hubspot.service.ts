import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as HubspotClient } from '@hubspot/api-client';
import { SimplePublicObject, SimplePublicObjectInput, SimplePublicObjectWithAssociations } from '@hubspot/api-client/lib/codegen/crm/companies';
import { CollectionResponseMultiAssociatedObjectWithLabelForwardPaging } from '@hubspot/api-client/lib/codegen/crm/associations/v4';
import { HubspotObjects } from '@common/enums';
import PQueue from 'p-queue';

/**
 * Service for interacting with Hubspot CRM API
 * Provides methods for CRUD operations and associations management with queue-based rate limiting
 */
@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);
  private readonly hubspotClient: HubspotClient;
  private readonly queue: PQueue;

  /**
   * Creates an instance of HubspotService
   * @param configService - NestJS config service for accessing environment variables
   */
  constructor(private readonly configService: ConfigService) {
    this.hubspotClient = new HubspotClient({
      accessToken: this.configService.get<string>('HUBSPOT_API_KEY', ''),
    });

    // Initialize p-queue with configuration
    this.queue = new PQueue({
      concurrency: Number(this.configService.get<number>('HUBSPOT_QUEUE_CONCURRENCY', 3)),
      interval: Number(this.configService.get<number>('HUBSPOT_QUEUE_INTERVAL', 1000)),
      intervalCap: Number(this.configService.get<number>('HUBSPOT_QUEUE_INTERVAL_CAP', 10)),
    });

    // Log queue events
    this.queue.on('active', () => {
      this.logger.debug(`Queue active - Pending: ${this.queue.pending}, Size: ${this.queue.size}`);
    });

    this.queue.on('idle', () => {
      this.logger.debug('Queue is idle');
    });

    this.logger.log(`HubspotService initialized with concurrency: ${this.queue.concurrency}`);
  }

  /**
   * Retrieves a Hubspot object by its ID
   * @param objectType - Type of Hubspot object (e.g., contacts, companies, deals)
   * @param objectId - Unique identifier of the object
   * @param properties - Optional array of property names to fetch
   * @returns Promise resolving to the Hubspot object with associations
   */
  async getHubspotObjectData<T>(objectType: HubspotObjects, objectId: string, properties: string[] = []): Promise<SimplePublicObjectWithAssociations> {
    return await this.queue.add(async () => {
      this.logger.debug(`Fetching Hubspot object ${objectType}, id ${objectId}`);
      const response = await this.hubspotClient.crm.objects.basicApi.getById(objectType, objectId, properties);
      this.logger.debug(`Successfully fetched ${objectType} with id ${objectId}`);
      return response as SimplePublicObjectWithAssociations;
    });
  }

  /**
   * Updates properties of an existing Hubspot object
   * @param objectType - Type of Hubspot object to update
   * @param objectId - Unique identifier of the object to update
   * @param properties - Key-value pair of properties to update
   * @returns Promise resolving to the updated object
   * @throws Error if the update operation fails
   */
  async updateHubspotObject(objectType: HubspotObjects, objectId: string, properties: SimplePublicObjectInput['properties']): Promise<SimplePublicObject> {
    return await this.queue.add(async () => {
      try {
        this.logger.debug(`Updating ${objectType} (ID: ${objectId})`);
        const result = await this.hubspotClient.crm.objects.basicApi.update(objectType, objectId, { properties });
        this.logger.log(`Successfully updated ${objectType} (ID: ${objectId})`);
        return result;
      } catch (error) {
        this.logger.error(`Failed to update ${objectType} (ID: ${objectId}): ${error?.message}`, error?.stack);
        throw error;
      }
    });
  }

  /**
   * Retrieves all associations between two Hubspot objects
   * Handles pagination automatically to fetch all results
   * @param fromObjectType - Source object type
   * @param fromObjectId - Source object identifier
   * @param toObjectType - Target object type to fetch associations for
   * @returns Promise resolving to array of associated objects
   */
  async getHubspotAssociations(
    fromObjectType: HubspotObjects,
    fromObjectId: string,
    toObjectType: HubspotObjects,
  ): Promise<CollectionResponseMultiAssociatedObjectWithLabelForwardPaging['results']> {
    return await this.queue.add(async () => {
      const allResults: CollectionResponseMultiAssociatedObjectWithLabelForwardPaging['results'] = [];
      let after: string | undefined;
      const limit = 100;

      try {
        this.logger.debug(`Fetching associations from ${fromObjectType} (${fromObjectId}) to ${toObjectType}`);

        do {
          const response = await this.hubspotClient.crm.associations.v4.basicApi.getPage(fromObjectType, fromObjectId, toObjectType, after, limit);

          allResults.push(...(response.results || []));
          after = response.paging?.next?.after;

          this.logger.debug(`Fetched ${response.results?.length || 0} associations, total so far: ${allResults.length}`);
        } while (after);

        this.logger.log(`Successfully fetched ${allResults.length} associations from ${fromObjectType} (${fromObjectId}) to ${toObjectType}`);
        return allResults;
      } catch (error) {
        this.logger.error(`Failed to fetch associations from ${fromObjectType} (${fromObjectId}) to ${toObjectType}: ${error?.message}`, error?.stack);
        return [];
      }
    });
  }

  /**
   * Retrieves current queue statistics for monitoring
   * @returns Object containing queue metrics
   */
  getQueueStats() {
    return {
      pending: this.queue.pending,
      size: this.queue.size,
      concurrency: this.queue.concurrency,
      isPaused: this.queue.isPaused,
    };
  }

  /**
   * Graceful shutdown handler that waits for all queued operations to complete
   * Called automatically by NestJS during application shutdown
   */
  async onApplicationShutdown() {
    this.logger.log('Waiting for queue to complete...');
    await this.queue.onIdle();
    this.logger.log('Queue completed, shutting down...');
  }
}
