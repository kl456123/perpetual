import { ethers } from 'ethers';
import { ApiMarketName, Networks, PerpetualOptions } from './types';
import { Contracts } from './contracts';
import { Api } from './api';
import { Orders } from './orders';
import { Trade } from './trade';
import { PriceOracle } from './price_oracle';
import { FundingOracle } from './funding_oracle';

export class Perpetual {
  public contracts: Contracts;
  public orders: Orders;
  public api: Api;
  public trade: Trade;
  public priceOracle: PriceOracle;
  public fundingOracle: FundingOracle;
  constructor(
    public provider: ethers.providers.JsonRpcProvider,
    market: ApiMarketName,
    networkId: number = Networks.MAINNET,
    options: PerpetualOptions = {}
  ) {
    this.contracts = new Contracts(provider, market, networkId);
    this.orders = new Orders(provider, this.contracts);
    this.api = new Api(this.orders, options.apiOptions);
    this.trade = new Trade(this.provider, this.contracts, this.orders);
    this.priceOracle = new PriceOracle(this.contracts);
    this.fundingOracle = new FundingOracle(this.contracts);
  }
}
