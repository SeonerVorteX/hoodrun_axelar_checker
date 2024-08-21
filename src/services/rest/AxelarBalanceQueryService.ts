import appConfig from "@/config/index";
import { AxiosService } from "@/services/rest/axios/AxiosService";
import { logger } from "@utils/logger";

interface BalanceResponse {
  balance: {
    denom: string;
    amount: string;
  };
}

export class AxelarBalanceQueryService {
  restClient: AxiosService;

  constructor() {
    this.restClient = new AxiosService({
      baseUrls: appConfig.mainnetAxelarLCDRestBaseUrls,
    });
  }

  async getBroadcasterBalance(): Promise<number> {
    try {
      const response = await this.restClient.request<BalanceResponse>({
        method: "GET",
        url: `/cosmos/bank/v1beta1/balances/${appConfig.axelarVoterAddress}/uaxl`,
      });

      return parseInt(response.data.balance.amount);
    } catch (error) {
      logger.error(`Error fetching broadcaster balance: ${error}`);
      throw error;
    }
  }
}
