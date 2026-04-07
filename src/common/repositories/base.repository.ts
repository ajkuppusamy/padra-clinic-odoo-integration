import { Repository, EntityManager, EntityTarget, FindOptionsWhere, FindManyOptions } from 'typeorm';
import { Logger } from '@nestjs/common';

export class BaseRepository<T extends object> {
  protected repository: Repository<T>;
  protected logger = new Logger(BaseRepository.name);

  constructor(
    protected readonly em: EntityManager,
    protected readonly entity: EntityTarget<T>,
  ) {
    this.repository = this.em.getRepository(entity);
  }

  protected getRepo(): Repository<T> {
    return this.repository;
  }

  /** Count entities by criteria */
  async countByCriteria(criteria: FindOptionsWhere<T>): Promise<number> {
    try {
      this.logger.log(`Counting entities with criteria: ${JSON.stringify(criteria)}`);
      return await this.getRepo().count({ where: criteria });
    } catch (error) {
      this.logger.error('Error counting entities', error);
      throw error;
    }
  }

  /** Find all entities by fields */
  async findAllByFields(fields: Partial<Record<keyof T, any>>, relations?: string[]): Promise<T[]> {
    try {
      this.logger.log(`Finding all entities with fields: ${JSON.stringify(fields)}`);

      const options: any = {
        where: fields,
      };
      if (relations && relations.length > 0) {
        options.relations = relations;
      }

      return await this.getRepo().find(options);
    } catch (error) {
      this.logger.error('Error finding all entities', error);
      throw error;
    }
  }

  /** Find one entity by ID */
  async findOneById(id: string, relations?: string[]): Promise<T | null> {
    try {
      this.logger.log(`Finding entity by ID: ${id}`);

      const options: any = {
        where: {
          id,
        },
      };

      if (relations && relations.length > 0) options.relations = relations;

      return await this.getRepo().findOne(options);
    } catch (error) {
      this.logger.error(`Error finding entity by ID: ${id}`, error);
      throw error;
    }
  }

  /** Delete entity by ID */
  async deleteById(id: string): Promise<void> {
    try {
      this.logger.log(`Deleting entity by ID: ${id}`);
      await this.getRepo().delete({ id } as any);
    } catch (error) {
      this.logger.error(`Error deleting entity by ID: ${id}`, error);
      throw error;
    }
  }

  /** Find one entity by multiple fields */
  async findByFields(fields: Partial<Record<keyof T, any>>, select?: (keyof T)[]): Promise<T | null> {
    try {
      this.logger.log(`Finding entity by fields: ${JSON.stringify(fields)}`);

      return await this.getRepo().findOne({
        where: fields as any,
        ...(select ? { select: select as any } : {}),
      });
    } catch (error) {
      this.logger.error(`Error finding entity by fields: ${JSON.stringify(fields)}`, error);
      throw error;
    }
  }

  /** Paginated find */
  async findPaginated(filters: FindOptionsWhere<T>, options?: FindManyOptions<T>): Promise<[T[], number]> {
    try {
      this.logger.log(`Finding paginated entities with filters: ${JSON.stringify(filters)}, options: ${JSON.stringify(options)}`);
      return await this.getRepo().findAndCount({
        where: filters,
        ...options,
      });
    } catch (error) {
      this.logger.error('Error finding paginated entities', error);
      throw error;
    }
  }

  /** Create or update entity */
  async persistAndFlush(entity: T): Promise<T> {
    try {
      this.logger.log(`Saving entity: ${JSON.stringify(entity)}`);
      return await this.getRepo().save(entity);
    } catch (error) {
      this.logger.error('Error saving entity', error);
      throw error;
    }
  }

  /** Remove entity */
  async removeAndFlush(entity: T): Promise<void> {
    try {
      this.logger.log(`Removing entity: ${JSON.stringify(entity)}`);
      await this.getRepo().remove(entity);
    } catch (error) {
      this.logger.error('Error removing entity', error);
      throw error;
    }
  }

  // expose query builder
  createQueryBuilder(alias: string) {
    return this.getRepo().createQueryBuilder(alias);
  }

  /** Convert array to Postgres array format */
  getPgArray(filterlist: string[]): string {
    if (!filterlist || filterlist.length === 0) return '{}';
    return `{${filterlist.join(',')}}`;
  }

  toNestedOrderBy(field: string, order: 'ASC' | 'DESC'): Record<string, any> {
    if (!field) return {};

    const parts = field.split('.');
    let nested: any = {};
    let current = nested;

    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (i === parts.length - 1) {
        current[key] = order;
      } else {
        current[key] = {};
        current = current[key];
      }
    }

    this.logger.log(`Nested order by generated: ${JSON.stringify(nested)}`);
    return nested;
  }
}
