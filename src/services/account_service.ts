import { address, ApiAccount, ApiBalance } from '../types';
import { Perpetual } from '../perpetual';
import { BigNumber } from 'bignumber.js';
import { DEPLOYER_ACCOUNT } from '../config';

export class AccountService {
  constructor(protected perpetual: Perpetual) {}

  public async getAccountBalanceAsync(account: address): Promise<ApiAccount> {
    const [balance, accountIndex] = await Promise.all([
      this.perpetual.contracts.perpetualProxy.getAccountBalance(account),
      this.perpetual.contracts.perpetualProxy.getAccountIndex(account),
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
      balances: { [this.perpetual.contracts.market]: apiBalance },
    };
  }

  public async drop(account: string, amount: BigNumber) {
    const wallet = this.perpetual.provider.getSigner(DEPLOYER_ACCOUNT);
    await this.perpetual.contracts.marginToken
      .connect(wallet)
      .mint(account, amount.toFixed(0));
  }
}
