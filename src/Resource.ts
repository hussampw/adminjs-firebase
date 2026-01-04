// src/Resource.ts
import { 
  BaseResource, 
  BaseRecord, 
  BaseProperty, 
  Filter, 
  PropertyType,
  ActionContext
} from 'adminjs';
import { CollectionReference, Query, DocumentData, Firestore } from 'firebase-admin/firestore';

export interface ResourceSchema {
  [key: string]: string | { type: string; schema?: ResourceSchema };
}

export interface ResourceOptions {
  collection: CollectionReference<DocumentData>;
  schema: ResourceSchema;
}

export class Resource extends BaseResource {
  private collection: CollectionReference<DocumentData>;
  private schema: ResourceSchema;
  private propertiesObject: Record<string, BaseProperty>;

  constructor(options: ResourceOptions) {
    super(options.collection);
    this.collection = options.collection;
    this.schema = options.schema || {};
    this.propertiesObject = this.prepareProperties();
  }

  public static isAdapterFor(rawResource: any): boolean {
    try {
      return (
        rawResource?.firestore !== undefined &&
        rawResource?.path !== undefined &&
        typeof rawResource?.doc === 'function'
      );
    } catch (e) {
      return false;
    }
  }

  public databaseName(): string {
    return 'Firestore';
  }

  public databaseType(): string {
    return 'firebase';
  }

  public id(): string {
    return this.collection.path;
  }

  public properties(): BaseProperty[] {
    return Object.values(this.propertiesObject);
  }

  public property(path: string): BaseProperty | null {
    return this.propertiesObject[path] || null;
  }

  private mapTypeToPropertyType(type: string): PropertyType {
    const typeMap: Record<string, PropertyType> = {
      'string': 'string',
      'number': 'number',
      'float': 'float',
      'boolean': 'boolean',
      'date': 'date',
      'datetime': 'datetime',
      'mixed': 'mixed',
      'reference': 'reference',
      'richtext': 'richtext',
      'textarea': 'textarea',
      'password': 'password',
    };
    return (typeMap[type] || 'string') as PropertyType;
  }

  private prepareProperties(): Record<string, BaseProperty> {
    const properties: Record<string, BaseProperty> = {};
    
    // Always add id property
    properties.id = new BaseProperty({
      path: 'id',
      type: 'string' as PropertyType,
      isId: true,
    });

    // Add schema properties
    Object.keys(this.schema).forEach((key) => {
      const schemaValue = this.schema[key];
      const propertyType = typeof schemaValue === 'string' 
        ? this.mapTypeToPropertyType(schemaValue)
        : this.mapTypeToPropertyType(schemaValue.type);
      
      properties[key] = new BaseProperty({
        path: key,
        type: propertyType,
        isId: false,
      });
    });

    return properties;
  }

  public async count(filter: Filter): Promise<number> {
    try {
      let query: Query = this.collection;
      
      // Apply filters if provided
      if (filter?.filters) {
        Object.entries(filter.filters).forEach(([key, filterElement]) => {
          if (filterElement && typeof filterElement === 'object' && 'value' in filterElement) {
            const value = filterElement.value;
            if (value !== undefined && value !== null && value !== '') {
              query = query.where(key, '==', value);
            }
          }
        });
      }

      const snapshot = await query.count().get();
      return snapshot.data().count;
    } catch (error) {
      console.error('Error counting documents:', error);
      return 0;
    }
  }

  public async find(
    filter: Filter,
    options: {
      limit?: number;
      offset?: number;
      sort?: { sortBy?: string; direction?: 'asc' | 'desc' };
    } = {},
    context?: ActionContext
  ): Promise<BaseRecord[]> {
    try {
      const { limit = 20, offset = 0, sort } = options;
      let query: Query = this.collection;

      // Apply filters
      if (filter?.filters) {
        Object.entries(filter.filters).forEach(([key, filterElement]) => {
          if (filterElement && typeof filterElement === 'object' && 'value' in filterElement) {
            const value = filterElement.value;
            if (value !== undefined && value !== null && value !== '') {
              query = query.where(key, '==', value);
            }
          }
        });
      }

      // Apply sorting
      if (sort?.sortBy) {
        query = query.orderBy(sort.sortBy, sort.direction || 'asc');
      } else {
        // Default sort by document ID
        query = query.orderBy('__name__');
      }

      // Apply pagination
      query = query.limit(limit);
      if (offset > 0) {
        query = query.offset(offset);
      }

      const snapshot = await query.get();
      
      return snapshot.docs.map((doc) => {
        const params = {
          id: doc.id,
          ...this.flattenParams(doc.data()),
        };
        return this.build(params);
      });
    } catch (error) {
      console.error('Error finding documents:', error);
      return [];
    }
  }

  public async findOne(id: string, context?: ActionContext): Promise<BaseRecord | null> {
    try {
      const doc = await this.collection.doc(id).get();
      
      if (!doc.exists) {
        return null;
      }

      const params = {
        id: doc.id,
        ...this.flattenParams(doc.data()),
      };
      
      return this.build(params);
    } catch (error) {
      console.error('Error finding document:', error);
      return null;
    }
  }

  public async findMany(ids: (string | number)[], context?: ActionContext): Promise<BaseRecord[]> {
    try {
      const stringIds = ids.map(id => String(id));
      const promises = stringIds.map((id) => this.collection.doc(id).get());
      const docs = await Promise.all(promises);
      
      return docs
        .filter((doc) => doc.exists)
        .map((doc) => {
          const params = {
            id: doc.id,
            ...this.flattenParams(doc.data()),
          };
          return this.build(params);
        });
    } catch (error) {
      console.error('Error finding many documents:', error);
      return [];
    }
  }

  public async create(params: Record<string, any>, context?: ActionContext): Promise<Record<string, any>> {
    try {
      const { id, ...data } = params;
      const processedData = this.unflattenParams(data);
      
      const docRef = id ? this.collection.doc(String(id)) : this.collection.doc();
      await docRef.set(processedData);
      
      return {
        id: docRef.id,
        ...this.flattenParams(processedData),
      };
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  }

  public async update(id: string, params: Record<string, any>, context?: ActionContext): Promise<Record<string, any>> {
    try {
      const { id: _, ...data } = params;
      const processedData = this.unflattenParams(data);
      
      await this.collection.doc(id).update(processedData);
      
      const updatedDoc = await this.collection.doc(id).get();
      return {
        id: updatedDoc.id,
        ...this.flattenParams(updatedDoc.data()),
      };
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  }

  public async delete(id: string, context?: ActionContext): Promise<void> {
    try {
      await this.collection.doc(id).delete();
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  // Build BaseRecord from params
  public build(params: Record<string, any>): BaseRecord {
    return new BaseRecord(params, this);
  }

  // Helper methods for nested objects
  private flattenParams(params: any = {}, prefix = ''): Record<string, any> {
    const flattened: Record<string, any> = {};
    
    if (!params || typeof params !== 'object') {
      return flattened;
    }

    Object.keys(params).forEach((key) => {
      const value = params[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(flattened, this.flattenParams(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    });
    
    return flattened;
  }

  private unflattenParams(params: Record<string, any>): DocumentData {
    const unflattened: any = {};
    
    Object.keys(params).forEach((key) => {
      const keys = key.split('.');
      let current = unflattened;
      
      keys.forEach((k, index) => {
        if (index === keys.length - 1) {
          current[k] = params[key];
        } else {
          current[k] = current[k] || {};
          current = current[k];
        }
      });
    });
    
    return unflattened;
  }
}

export default Resource;