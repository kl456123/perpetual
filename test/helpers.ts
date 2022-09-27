import { ethers } from 'hardhat';
import { BigNumberish, BigNumber, Signer, Contract } from 'ethers';
import { address } from '../src/types';
import { Provider } from '@ethersproject/providers';

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
  const amountBN = BigNumber.from(amount);
  const account = await accountSigner.getAddress();

  await marginToken.connect(deployerSigner).mint(account, amountBN);
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
