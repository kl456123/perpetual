import { ethers } from 'ethers';
import { BigNumber } from 'bignumber.js';
import {
  ApiMarketName,
  ChainId,
  PerpetualOptions,
  ApiBalance,
  ApiAccount,
} from './types';
import { Contracts } from './contracts';
import { Api } from './api';
import { Orders } from './orders';
import { Trade } from './trade';
import { PriceOracle } from './price_oracle';
import { FundingOracle } from './funding_oracle';
import { WalletProvider } from './wallet_provider';

export class Perpetual {
  public contracts: Contracts;
  public orders: Orders;
  public api: Api;
  public trade: Trade;
  public priceOracle: PriceOracle;
  public fundingOracle: FundingOracle;
  constructor(
    public provider: WalletProvider,
    market: ApiMarketName,
    chainId: number = ChainId.Mainnet,
    options: PerpetualOptions = {}
  ) {
    this.contracts = new Contracts(provider, market, chainId);
    this.orders = new Orders(provider, this.contracts);
    this.api = new Api(this.orders, options.apiOptions);
    this.trade = new Trade(this.provider, this.contracts, this.orders);
    this.priceOracle = new PriceOracle(this.contracts);
    this.fundingOracle = new FundingOracle(this.contracts);
  }

  async getAccount(account: string): Promise<ApiAccount> {
    const [balance, accountIndex] = await Promise.all([
      this.contracts.perpetualProxy.getAccountBalance(account),
      this.contracts.perpetualProxy.getAccountIndex(account),
    ]);
    const indexValue = new BigNumber(accountIndex.value.toString());

    const margin = new BigNumber(balance.margin.toString());
    const position = new BigNumber(balance.position.toString());

    const apiBalance: ApiBalance = {
      margin: (balance.marginIsPositive ? margin : margin.negated()).toString(),
      position: (balance.positionIsPositive
        ? position
        : position.negated()
      ).toString(),
      indexValue: accountIndex.isPositive
        ? indexValue.toString()
        : indexValue.negated().toString(),
      indexTimestamp: accountIndex.timestamp.toString(),
    };

    return {
      owner: account,
      balances: { [this.contracts.market]: apiBalance },
    };
  }
}
