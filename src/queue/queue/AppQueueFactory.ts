import appConfig from "@config/index";
import Queue from "bull";

const { redisHost, redisPort } = appConfig;

const redisConfig = {
  redis: {
    host: redisHost,
    port: redisPort,
    // other Redis options...
  },
};

class AppQueueFactory {
  private queues: { [key: string]: Queue.Queue } = {};
  private static instance: AppQueueFactory;

  private constructor() {
    if (!AppQueueFactory.instance) {
      AppQueueFactory.instance = this;
    }
  }

  public static getInstance(): AppQueueFactory {
    if (!AppQueueFactory.instance) {
      AppQueueFactory.instance = new AppQueueFactory();
    }

    return AppQueueFactory.instance;
  }

  createQueue<T>(name: string): Queue.Queue<T> {
    if (!this.queues[name]) {
      const queue = new Queue(name, { ...redisConfig });
      this.onQueueError(queue, name);
      this.onQueueCompleted(queue, name);
      queue.empty();

      this.queues[name] = queue;
    }

    return this.queues[name];
  }

  onQueueError(queue: Queue.Queue, name: string) {
    queue.on("error", (error) => {
      console.error(`Queue ${name} error:`, error);
    });
  }

  onQueueCompleted(queue: Queue.Queue, name: string) {
    queue.on("completed", (job) => {
      console.log(`Queue ${name} job completed:`, job.data);
    });
  }
}

export default AppQueueFactory.getInstance();
