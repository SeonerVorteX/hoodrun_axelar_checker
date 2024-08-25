import appConfig from "@/config/index";
import { AxiosService } from "@/services/rest/axios/AxiosService";
import { RegisterProxyGetResponse } from "@/services/rest/interfaces/tx/RegisterProxyGetResponse";
import { logger } from "@utils/logger";

export class AxelarLCDQueryService {
  restClient: AxiosService;

  constructor() {
    this.restClient = new AxiosService({
      baseUrls: appConfig.mainnetAxelarLCDRestBaseUrls,
    });
  }

  /*Proxy Address means broadcaster and voter address also*/
  private async getValidatorRegisterProxyInfo(
    operatorAddress: string
  ): Promise<RegisterProxyGetResponse> {
    const response = await this.restClient.request<RegisterProxyGetResponse>({
      method: "GET",
      url: `cosmos/tx/v1beta1/txs?events=message.sender='${operatorAddress}'&events=message.action='RegisterProxy'`,
    });

    return response?.data;
  }

  public async getValidatorVoterAddress(
    operatorAddress: string
  ): Promise<string | null> {
    try {
      const response = await this.getValidatorRegisterProxyInfo(operatorAddress);
      if (!response || response.txs.length === 0) {
        logger.warn(`No RegisterProxy tx found for operatorAddress: ${operatorAddress}`);
        return null; // Return null if no transaction is found
      }

      const firstMessage = response.txs[0]?.body?.messages?.[0];
      if (!firstMessage) {
        logger.warn(`No message found in RegisterProxy tx for operatorAddress: ${operatorAddress}`);
        return null; // Return null if no message is found
      }

      return firstMessage.proxy_addr as string;
    } catch (error) {
      logger.error(`Failed to get voter address: ${error}`);
      throw error;
    }
  }
}
