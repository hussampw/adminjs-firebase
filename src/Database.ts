// src/Database.ts
import { BaseDatabase } from 'adminjs';
import { Firestore } from 'firebase-admin/firestore';

export class Database extends BaseDatabase {
  private firestore: Firestore;

  constructor(firestore: Firestore) {
    super(firestore);
    this.firestore = firestore;
  }

  public static isAdapterFor(database: any): boolean {
    try {
      // Check if it's a Firestore instance
      return (
        database !== null &&
        database !== undefined &&
        typeof database.collection === 'function' &&
        typeof database.doc === 'function' &&
        database.constructor?.name === 'Firestore'
      );
    } catch (e) {
      return false;
    }
  }

  public resources(): any[] {
    // Firestore doesn't expose a method to list all collections at the root level
    // Collections must be explicitly defined in AdminJS configuration
    return [];
  }
}

export default Database;