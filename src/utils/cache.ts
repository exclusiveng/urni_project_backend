import NodeCache from "node-cache";

// Standard TTL: 1 hour (3600 seconds)
// Check period: 10 minutes (600 seconds)
export const appCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

export const CacheKeys = {
    ALL_BRANCHES: "ALL_BRANCHES_KEY"
};
