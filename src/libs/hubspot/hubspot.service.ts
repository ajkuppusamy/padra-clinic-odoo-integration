import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as HubspotClient } from '@hubspot/api-client';
import {
  BatchReadInputSimplePublicObjectId,
  BatchResponseSimplePublicObject,
  CollectionResponseWithTotalSimplePublicObjectForwardPaging,
  PublicObjectSearchRequest,
  SimplePublicObject,
  SimplePublicObjectInput,
  SimplePublicObjectInputForCreate,
  SimplePublicObjectWithAssociations,
} from '@hubspot/api-client/lib/codegen/crm/companies';
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
   * @returns {Promise<SimplePublicObjectWithAssociations> }
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
   * @returns {Prmoise<SimplePublicObjectWithAssociations>}
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
        this.logger.error(`Failed to update ${objectType} (ID: ${objectId}): ${error?.['message']}`, error?.['stack']);
        throw error;
      }
    });
  }

  /**
   * Creates a new object in HubSpot CRM for the specified object type.
   *
   * This method queues the creation operation to ensure proper request handling
   * and retry logic. It automatically handles logging for debug, success, and
   * error scenarios. The operation is performed asynchronously and returns
   * the created HubSpot object upon successful creation.
   *
   * @param {HubspotObjects} objectType - The type of HubSpot CRM object to create (e.g., 'contacts', 'companies', 'deals', 'tickets')
   * @param {SimplePublicObjectInputForCreate} properties - The properties data for creating the HubSpot object, containing field values and associations
   *
   * @returns {Promise<SimplePublicObject>} A promise that resolves to the created HubSpot object with all its properties and metadata
   *
   * @throws {Error} Throws an error if the HubSpot API call fails, including network issues, validation errors, or authentication problems
   *
   */
  async createHubspotObject(objectType: HubspotObjects, properties: SimplePublicObjectInputForCreate): Promise<SimplePublicObject> {
    return await this.queue.add(async () => {
      try {
        this.logger.debug(`Create ${objectType} )`);
        const result = await this.hubspotClient.crm.objects.basicApi.create(objectType, properties);
        this.logger.log(`Successfully updated ${objectType} (ID: ${result.id})`);
        return result;
      } catch (error) {
        this.logger.error(`Failed to update ${objectType}: ${error?.['message']}`, error?.['stack']);
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
   * @returns {Promise<CollectionResponseMultiAssociatedObjectWithLabelForwardPaging['results']> }
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
        this.logger.error(`Failed to fetch associations from ${fromObjectType} (${fromObjectId}) to ${toObjectType}: ${error?.['message']}`, error?.['stack']);
        return [];
      }
    });
  }

  /**
   * Searches HubSpot CRM objects using the provided search request with optional pagination support.
   *
   * This method executes the search operation through an internal queue to control concurrency
   * and handle rate limits. It supports cursor-based pagination using the `after` parameter
   * and allows limiting the number of records per request.
   *
   * @param {HubspotObjects} objectType - The type of HubSpot object to search (e.g., contacts, deals, products).
   * @param {PublicObjectSearchRequest} publicObjectSearchRequest - The search request payload containing filters, properties, and sort options.
   * @param {Object} [options] - Optional pagination parameters.
   * @param {string} [options.after] - Cursor token to fetch the next set of results.
   * @param {number} [options.limit] - Maximum number of records to retrieve per request (max: 100).
   *
   * @returns {Promise<CollectionResponseWithTotalSimplePublicObjectForwardPaging>}
   * A promise resolving to the paginated response containing matched objects, total count, and paging information.
   *
   * @throws {Error} Throws an error if the search operation fails.
   */
  async searchObject(
    objectType: HubspotObjects,
    publicObjectSearchRequest: PublicObjectSearchRequest,
    options?: { after?: string; limit?: number },
  ): Promise<CollectionResponseWithTotalSimplePublicObjectForwardPaging> {
    return this.queue.add(async () => {
      try {
        if (options?.after) {
          publicObjectSearchRequest.after = options.after;
        }

        if (options?.limit) {
          publicObjectSearchRequest.limit = options.limit;
        }

        this.logger.debug(
          `Searching ${objectType} | after: ${options?.after || 'none'} | limit: ${options?.limit || 'default'} | filters: ${JSON.stringify(publicObjectSearchRequest?.filterGroups)}`,
        );

        const result = await this.hubspotClient.crm.objects.searchApi.doSearch(objectType, publicObjectSearchRequest);

        this.logger.log(`Fetched ${objectType} | total: ${result?.total} | returned: ${result?.results?.length} | nextAfter: ${result?.paging?.next?.after}`);

        return result;
      } catch (error) {
        this.logger.error(`Failed to search ${objectType}: ${error?.['message']}`, error?.['stack']);
        throw error;
      }
    });
  }

  /**
   * Fetches multiple HubSpot objects in a single batch request using their IDs.
   *
   * This method leverages HubSpot's Batch Read API to retrieve objects by providing
   * a list of object IDs. It executes the request through an internal queue to
   * control concurrency and rate limits.
   *
   * @param {HubspotObjects} objectType - The type of HubSpot object to retrieve (e.g., contacts, deals, companies).
   * @param {BatchReadInputSimplePublicObjectId} batchReadInputSimplePublicObjectId - Payload containing the list of object IDs to be fetched.
   *
   * @returns {Promise<BatchResponseSimplePublicObject>} A promise that resolves to the batch response containing the retrieved objects.
   *
   * @throws {Error} Throws an error if the batch fetch operation fails.
   */
  async getBatchObject(objectType: HubspotObjects, batchReadInputSimplePublicObjectId: BatchReadInputSimplePublicObjectId): Promise<BatchResponseSimplePublicObject> {
    return this.queue.add(async () => {
      try {
        this.logger.debug(`Batch fetching ${objectType} | count: ${batchReadInputSimplePublicObjectId.inputs.length}`);

        const result = await this.hubspotClient.crm.objects.batchApi.read(objectType, batchReadInputSimplePublicObjectId);

        this.logger.log(`Fetched ${objectType} | returned: ${result?.results?.length}`);

        return result as BatchResponseSimplePublicObject;
      } catch (error) {
        this.logger.error(`Failed to batch fetch ${objectType}: ${error?.['message']}`, error?.['stack']);
        throw error;
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
