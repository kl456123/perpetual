import { ethers } from 'hardhat';
import { BigNumberish, Signer, Contract } from 'ethers';
import { BigNumber } from 'bignumber.js';
import {
  address,
  SigningMethod,
  BigNumberable,
  SignedOrder,
  Order,
  Price,
  Fee,
} from '../src/types';
import { Provider } from '@ethersproject/providers';
import { Perpetual } from '../src/perpetual';
import { PRICES, ADDRESSES, INTEGERS, FEES } from '../src/constants';
import { expect } from 'chai';

import {
  P1Orders,
  P1Orders__factory,
  PerpetualV1,
  PerpetualV1__factory,
  PerpetualProxy,
  PerpetualProxy__factory,
  MockToken,
  MockToken__factory,
  P1MakerOracle,
  P1MakerOracle__factory,
  P1FundingOracle,
  P1FundingOracle__factory,
  P1LiquidatorProxy,
  P1LiquidatorProxy__factory,
  P1Deleveraging,
  P1Deleveraging__factory,
  Test_ChainlinkAggregator,
  Test_ChainlinkAggregator__factory,
} from '../typechain-types';

export async function deployContract(
  contractName: string,
  ...constructorArgs: any
) {
  const Contract = await ethers.getContractFactory(contractName);
  const contract = await Contract.deploy(...constructorArgs);

  await contract.deployed();
  console.log(`${contractName} deployed to:`, contract.address);
  return contract;
}

/**
 * Mint test token to an account and deposit it in the perpetual.
 */
export async function mintAndDeposit(
  marginToken: Contract,
  perpetualProxy: Contract,
  amount: BigNumberish,
  deployerSigner: Signer,
  accountSigner: Signer
): Promise<void> {
  const account = await accountSigner.getAddress();

  await marginToken.connect(deployerSigner).mint(account, amount);
  const max = ethers.constants.MaxUint256;
  await marginToken.connect(accountSigner).approve(perpetualProxy.address, max);
  await perpetualProxy.connect(accountSigner).deposit(account, amount);
}

export function getTestContracts(
  addressBook: Record<string, string>,
  provider: Provider
) {
  const testChainlinkAggregator = Test_ChainlinkAggregator__factory.connect(
    addressBook.Test_ChainlinkAggregator,
    provider
  );
  return {
    testChainlinkAggregator,
  };
}

export async function buy(
  perpetual: Perpetual,
  taker: address,
  maker: address,
  position: BigNumberable,
  cost: BigNumberable
) {
  return trade(perpetual, taker, maker, position, cost, true);
}

export async function sell(
  perpetual: Perpetual,
  taker: address,
  maker: address,
  position: BigNumberable,
  cost: BigNumberable
) {
  return trade(perpetual, taker, maker, position, cost, false);
}

export async function trade(
  perpetual: Perpetual,
  taker: address,
  maker: address,
  position: BigNumberable,
  cost: BigNumberable,
  isBuy: boolean
) {
  const newOrder: Order = {
    limitPrice: new Price(cost),
    isBuy: !isBuy,
    isDecreaseOnly: false,
    amount: new BigNumber(position),
    triggerPrice: PRICES.NONE,
    limitFee: FEES.ZERO,
    taker,
    maker,
    expiration: INTEGERS.ONE_YEAR_IN_SECONDS.times(100),
    salt: new BigNumber('425'),
  };

  const order = await perpetual.orders.getSignedOrder(
    newOrder,
    SigningMethod.Hash
  );

  const fillPrice = order.limitPrice;
  const fillFee = order.limitFee;

  const fillAmount = order.amount.dp(0, BigNumber.ROUND_DOWN);

  return perpetual.trade
    .initiate()
    .fillSignedOrder(order.taker, order, fillAmount, fillPrice, fillFee)
    .commit({ from: taker });
}

export async function expectBalances(
  perpetual: Perpetual,
  accounts: address[],
  expectedMargins: BigNumberable[],
  expectedPositions: BigNumberable[],
  fullySettled = true,
  positionsSumToZero = true
): Promise<void> {
  await Promise.all([
    expectMarginBalances(perpetual, accounts, expectedMargins, fullySettled),
    expectPositions(perpetual, accounts, expectedPositions, positionsSumToZero),
  ]);
}

export async function expectMarginBalances(
  perpetual: Perpetual,
  accounts: address[],
  expectedMargins: BigNumberable[],
  fullySettled = true
): Promise<void> {
  const actualMargins = await Promise.all(
    accounts.map((account: address) => {
      return perpetual.contracts.perpetualProxy
        .getAccountBalance(account)
        .then(balance =>
          balance.marginIsPositive
            ? new BigNumber(balance.margin.toString())
            : new BigNumber(balance.margin.toString()).negated()
        );
    })
  );

  for (const i in expectedMargins) {
    const expectedMargin = new BigNumber(expectedMargins[i]);
    expect(actualMargins[i], `accounts[${i}] actual margin`).eq(expectedMargin);
  }

  // Contract solvency check
  if (fullySettled) {
    const accountSumMargin = actualMargins.reduce(
      (a, b) => a.plus(b),
      INTEGERS.ZERO
    );
    const perpetualTokenBalance =
      await perpetual.contracts.marginToken.balanceOf(
        perpetual.contracts.perpetualProxy.address
      );
    expect(accountSumMargin, 'sum of margins equals token balance').eq(
      perpetualTokenBalance
    );
  }
}

/**
 * Verify that the account position balances match the expected values.
 *
 * If sumToZero is set to true (the default) then a check will be performed to ensure the position
 * balances sum to zero. This should always be the case when (for example) the prvoided accounts
 * represent all accounts on the contract with positions.
 */
export async function expectPositions(
  perpetual: Perpetual,
  accounts: address[],
  expectedPositions: BigNumberable[],
  sumToZero = true
) {
  const actualPositions = await Promise.all(
    accounts.map((account: address) => {
      return perpetual.contracts.perpetualProxy
        .getAccountBalance(account)
        .then(balance =>
          balance.positionIsPositive
            ? new BigNumber(balance.position.toString())
            : new BigNumber(balance.position.toString()).negated()
        );
    })
  );

  for (const i in expectedPositions) {
    const expectedPosition = new BigNumber(expectedPositions[i]);
    expect(actualPositions[i], `accounts[${i}] actual position`).eq(
      expectedPosition
    );
  }

  if (sumToZero) {
    const accountSumPosition = actualPositions.reduce(
      (a, b) => a.plus(b),
      INTEGERS.ZERO
    );
    expect(accountSumPosition, 'sum of positions is not zero').eq(
      INTEGERS.ZERO
    );
  }
}

// For solidity function calls that violate require()
export async function expectThrow(promise: Promise<any>, reason: string) {
  await expect(promise).to.be.revertedWith(reason);
}
