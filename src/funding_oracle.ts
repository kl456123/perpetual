import { Contracts } from './contracts';
import { BigNumberable, BaseValue, FundingRate } from './types';
import { BigNumber } from 'bignumber.js';

export class FundingOracle {
  private contracts: Contracts;

  constructor(contracts: Contracts) {
    this.contracts = contracts;
  }

  public get address(): string {
    return this.contracts.fundingOracle.address;
  }

  public async getFunding(timeDeltaSeconds: BigNumberable): Promise<BaseValue> {
    const [isPositive, funding] = await this.contracts.fundingOracle.getFunding(
      new BigNumber(timeDeltaSeconds).toFixed(0)
    );
    return BaseValue.fromSolidity(funding.toString(), isPositive);
  }

  /**
   * Get the current funding rate, represented as a per-second rate.
   */
  public async getFundingRate(): Promise<FundingRate> {
    const oneSecondFunding = await this.getFunding(1);
    return new FundingRate(oneSecondFunding.value);
  }
}
