import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as HubspotClient } from '@hubspot/api-client';
import {
  AssociationSpec,
  BatchInputSimplePublicObjectBatchInput,
  BatchInputSimplePublicObjectBatchInputForCreate,
  BatchReadInputSimplePublicObjectId,
  BatchResponseSimplePublicObject,
  CollectionResponseSimplePublicObjectWithAssociationsForwardPaging,
  CollectionResponseWithTotalSimplePublicObjectForwardPaging,
  HttpFile,
  PromiseConfigurationOptions,
  PublicObjectSearchRequest,
  SimplePublicObject,
  SimplePublicObjectInput,
  SimplePublicObjectInputForCreate,
  SimplePublicObjectWithAssociations,
} from '@hubspot/api-client/lib/codegen/crm/companies';
import { CollectionResponseMultiAssociatedObjectWithLabelForwardPaging } from '@hubspot/api-client/lib/codegen/crm/associations/v4';
import { HubspotObjects } from '@common/enums';
import PQueue from 'p-queue';
import { PublicOwner } from '@hubspot/api-client/lib/codegen/crm/owners/models/all';

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
      const response = await this.hubspotClient.crm.objects.basicApi.getById(objectType, objectId, properties, ['odoo_payment_amount']);
      this.logger.debug(`Successfully fetched ${objectType} with id ${objectId}`);
      return response as SimplePublicObjectWithAssociations;
    });
  }

  /**
   * Fetches a single page of HubSpot objects for a given object type.
   *
   * @param objectType - The type of HubSpot object to fetch
   * @param properties - Array of property names to include in the response
   * @param limit - Maximum number of items to return per page (max: 100)
   * @param after - Pagination cursor for fetching the next page
   * @returns Promise containing paginated response with results and next page cursor
   */
  async getHubspotObjectList(
    objectType: HubspotObjects,
    properties: string[] = [],
    limit?: number,
    after?: string,
  ): Promise<CollectionResponseSimplePublicObjectWithAssociationsForwardPaging> {
    return await this.queue.add(async () => {
      this.logger.debug(`Fetching Hubspot ${objectType} objects${limit ? ` (limit: ${limit})` : ''}`);

      const response = await this.hubspotClient.crm.objects.basicApi.getPage(objectType, limit, after, properties);

      this.logger.debug(`Fetched ${response.results?.length || 0} ${objectType} objects`);

      return response;
    });
  }

  /**
   * Fetches all HubSpot objects across multiple pages, with optional total limit.
   *
   * @param objectType - The type of HubSpot object to fetch
   * @param properties - Array of property names to include in the response
   * @param limit - Maximum total number of objects to fetch (optional, fetches all if not specified)
   * @param pageSize - Number of items to fetch per API call (default: 100, max: 100)
   * @returns Promise containing array of all fetched objects
   */
  async getAllHubspotObjects(objectType: HubspotObjects, properties: string[] = [], limit?: number, pageSize: number = 100): Promise<SimplePublicObjectWithAssociations[]> {
    let allResults: SimplePublicObjectWithAssociations[] = [];
    let after: string | undefined = undefined;
    let hasMore = true;
    let remainingToFetch = limit || Infinity;

    while (hasMore && remainingToFetch > 0) {
      const fetchSize = Math.min(pageSize, remainingToFetch);

      const response = await this.getHubspotObjectList(objectType, properties, fetchSize, after);

      if (response.results && response.results.length > 0) {
        allResults = [...allResults, ...response.results];
        remainingToFetch -= response.results.length;
      }

      if (response.paging?.next?.after && remainingToFetch > 0) {
        after = response.paging.next.after;
        hasMore = true;
      } else {
        hasMore = false;
      }
    }

    this.logger.debug(`Fetched ${allResults.length} ${objectType} objects (limit: ${limit || 'unlimited'})`);
    return allResults;
  }

  /**
   * Retrieves a Hubspot Owners by its ID
   * @param id - Unique identifier of the owner
   * @returns {Promise<PublicOwner> }
   */
  async getHubspotOwnerById(id: string): Promise<PublicOwner> {
    return await this.queue.add(async () => {
      this.logger.debug(`Fetching HubSpot owner ${id}`);
      const response = await this.hubspotClient.crm.owners.ownersApi.getById(Number(id));
      this.logger.debug(`Successfully fetched owner with id ${id}`);
      return response;
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
   * Creates an association between two HubSpot objects
   *
   * @param fromObjectType - Source object type
   * @param fromObjectId - Source object ID
   * @param toObjectType - Target object type
   * @param toObjectId - Target object ID
   * @param associationSpec - Association definition
   */
  async createHubspotAssociation(
    fromObjectType: HubspotObjects,
    fromObjectId: string,
    toObjectType: HubspotObjects,
    toObjectId: string,
    associationSpec: AssociationSpec[],
  ): Promise<boolean> {
    return await this.queue.add(async () => {
      try {
        this.logger.debug(`Creating association from ${fromObjectType} (${fromObjectId}) to ${toObjectType} (${toObjectId})`);

        await this.hubspotClient.crm.associations.v4.basicApi.create(fromObjectType, fromObjectId, toObjectType, toObjectId, associationSpec);

        this.logger.log(`Successfully created association from ${fromObjectType} (${fromObjectId}) to ${toObjectType} (${toObjectId})`);

        return true;
      } catch (error: any) {
        this.logger.error(`Failed to create association from ${fromObjectType} (${fromObjectId}) to ${toObjectType} (${toObjectId}): ${error?.message}`, error?.stack);

        return false;
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
   * Creates multiple HubSpot objects in a single batch request.
   *
   * This method leverages HubSpot's Batch Create API to create multiple objects
   * in one request. It executes the request through an internal queue to
   * control concurrency and rate limits.
   *
   * @param {HubspotObjects} objectType - The type of HubSpot object to create (e.g., contacts, deals, companies, line_items).
   * @param {BatchInputSimplePublicObjectInputForCreate} batchInput - Payload containing the objects to create.
   *
   * @returns {Promise<BatchResponseSimplePublicObject>} A promise that resolves to the batch response containing the created objects.
   *
   * @throws {Error} Throws an error if the batch create operation fails.
   */
  async createBatchObject(objectType: HubspotObjects, batchInput: BatchInputSimplePublicObjectBatchInputForCreate): Promise<BatchResponseSimplePublicObject> {
    return this.queue.add(async () => {
      try {
        this.logger.debug(`Batch creating ${objectType} | count: ${batchInput.inputs.length}`);

        const result = await this.hubspotClient.crm.objects.batchApi.create(objectType, batchInput);

        this.logger.log(`Created ${objectType} | returned: ${result?.results?.length}`);

        return result as BatchResponseSimplePublicObject;
      } catch (error) {
        this.logger.error(`Failed to batch create ${objectType}: ${error?.['message']}`, error?.['stack']);
        throw error;
      }
    });
  }

  /**
   * Updates multiple HubSpot objects in a single batch request.
   *
   * This method leverages HubSpot's Batch Update API to update multiple objects
   * in one request. It executes the request through an internal queue to
   * control concurrency and rate limits.
   *
   * @param {HubspotObjects} objectType - The type of HubSpot object to update (e.g., contacts, deals, companies, line_items).
   * @param {BatchInputSimplePublicObjectBatchInput} batchInput - Payload containing the objects to update.
   *
   * @returns {Promise<BatchResponseSimplePublicObject>} A promise that resolves to the batch response containing the updated objects.
   *
   * @throws {Error} Throws an error if the batch update operation fails.
   */
  async updateBatchObject(objectType: HubspotObjects, batchInput: BatchInputSimplePublicObjectBatchInput): Promise<BatchResponseSimplePublicObject> {
    return this.queue.add(async () => {
      try {
        this.logger.debug(`Batch updating ${objectType} | count: ${batchInput.inputs.length}`);

        const result = await this.hubspotClient.crm.objects.batchApi.update(objectType, batchInput);

        this.logger.log(`Updated ${objectType} | returned: ${result?.results?.length}`);

        return result as BatchResponseSimplePublicObject;
      } catch (error) {
        this.logger.error(`Failed to batch update ${objectType}: ${error?.['message']}`, error?.['stack']);
        throw error;
      }
    });
  }

  async fileUpload(
    file?: HttpFile | undefined,
    folderId?: string,
    folderPath?: string,
    fileName?: string,
    charsetHunch?: string,
    options?: string,
    _options?: PromiseConfigurationOptions,
  ): Promise<any> {
    return this.queue.add(async () => {
      try {
        const result = await this.hubspotClient.files.filesApi.upload(file, folderId, folderPath, fileName, charsetHunch, options);

        return result;
      } catch (error) {
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
