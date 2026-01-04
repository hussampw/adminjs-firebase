import { Database } from './Database.js';
import { Resource } from './Resource.js';

export { Database, Resource };

// Default export for AdminJS.registerAdapter()
export default {
  Database,
  Resource,
};

// Named exports for convenience
export * from './Database.js';
export * from './Resource.js';