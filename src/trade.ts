import { Orders } from './orders';
import { ethers } from 'ethers';
import { TradeOperation } from './tradeOperation';
import { Contracts } from './contracts';

export class Trade {
  constructor(
    private provider: ethers.providers.JsonRpcProvider,
    private contracts: Contracts,
    private orders: Orders
  ) {}

  // ============ Public Functions ============

  public initiate(): TradeOperation {
    return new TradeOperation(this.provider, this.contracts, this.orders);
  }
}
