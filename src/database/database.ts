import { AxlStateRepository } from "@repositories/axlstate/AxlStateRepository";
import { NotificationRepository } from "@repositories/notification/NotificationRepository";
import { PollRepository } from "@repositories/poll/PollRepository";
import { PollVoteRepository } from "@repositories/poll/PollVoteRepository";
import { TelegramUserRepository } from "@repositories/telegram_user/TelegramUserRepository";
import { TxRepository } from "@repositories/tx/TxRepository";
import { ValidatorRepository } from "@repositories/validator/ValidatorRepository";

export class AppDb {
  validatorRepository: ValidatorRepository;
  telegramUserRepo: TelegramUserRepository;
  txRepo: TxRepository;
  notificationRepo: NotificationRepository;
  pollRepo: PollRepository;
  axlStateRepo: AxlStateRepository;
  pollVoteRepo: PollVoteRepository;
  constructor() {
    this.validatorRepository = new ValidatorRepository();
    this.txRepo = new TxRepository();
    this.telegramUserRepo = new TelegramUserRepository();
    this.notificationRepo = new NotificationRepository();
    this.pollRepo = new PollRepository();
    this.pollVoteRepo = new PollVoteRepository();
    this.axlStateRepo = new AxlStateRepository();
  }
}
