import appConfig from "@config/index";
import { logger } from "@utils/logger";
import Queue from "bull";
import Redis from 'ioredis';

const { redisHost, redisPort } = appConfig;

const redisClient = new Redis({
  host: redisHost,
  port: redisPort,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.info(`Attempting to reconnect to Redis (attempt ${times})`);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisClient.on('error', (error) => {
  logger.error(`Redis connection error: ${error}`);
});

redisClient.on('connect', () => {
  logger.info('Successfully connected to Redis');
});

redisClient.on('reconnecting', () => {
  logger.info('Reconnecting to Redis...');
});

class AppQueueFactory {
  private static queues: { [key: string]: Queue.Queue } = {};
  private static instance: AppQueueFactory;

  private constructor() {}

  public static getInstance(): AppQueueFactory {
    if (!AppQueueFactory.instance) {
      AppQueueFactory.instance = new AppQueueFactory();
    }
    return AppQueueFactory.instance;
  }

  public static getQueue(name: string): Queue.Queue {
    if (!this.queues[name]) {
      this.queues[name] = this.createQueue(name);
    }
    return this.queues[name];
  }

  public static createQueue<T>(name: string): Queue.Queue<T> {
    if (!this.queues[name]) {
      try {
        const queue = new Queue(name, {
          createClient: (type) => {
            switch (type) {
              case 'client':
                return redisClient;
              case 'subscriber':
                return new Redis(redisClient.options);
              case 'bclient':
                return new Redis(redisClient.options);
              default:
                return redisClient;
            }
          },
          limiter: { max: 5000, duration: 1000 },
        });
        this.onQueueError(queue, name);
        this.onQueueCompleted(queue, name);
        queue.empty();

        this.queues[name] = queue;
        logger.info(`Queue ${name} created successfully`);
      } catch (error) {
        logger.error(`Error creating queue ${name}: ${error}`);
        throw error;
      }
    }

    return this.queues[name];
  }

  private static onQueueError(queue: Queue.Queue, name: string) {
    queue.on("error", (error) => {
      logger.error(`Queue ${name} error: ${error}`);
    });
  }

  private static onQueueCompleted(queue: Queue.Queue, name: string) {
    queue.on("completed", (job) => {
      logger.info(`Queue ${name} job completed`);
    });
  }

  public static async checkRedisConnection() {
    try {
      await redisClient.ping();
      return true;
    } catch (error) {
      logger.error('Redis connection check failed:', error);
      return false;
    }
  }

  public static getAllQueues(): Queue.Queue[] {
    return Object.values(this.queues);
  }
}

export default AppQueueFactory;