import { ethers } from 'hardhat';

export enum Network {
  Ethereum = 1,
  BSC = 56,
  OKC = 66,
  OKCTest = 67,
  Kovan = 42,
  Goerli = 420,
}

export function getDeployerAddress(network: Network) {
  // if (network === Network.Ethereum || network===Network.Goerli) {
  return process.env.DEPLOYER_ACCOUNT as string;
  // }
  // throw new Error('Cannot find Deployer address');
}

export function getDeleveragingOperatorAddress(network: Network) {
  // if (network === Network.Ethereum || network===Network.Goerli) {
  return process.env.DELEVERAGING_ACCOUNT as string; // TODO
  // }

  // throw new Error('Cannot find funding rate provider address');
}

function getFundingRateProviderAddress(network: Network) {
  // if (network === Network.Ethereum) {
  // return '0xe5E98525553d8a20d77211F4db4DC1f599515FF3';
  // }

  // if(network===Network.Goerli){
  return process.env.DEPLOYER_ACCOUNT as string;
  // }
  // throw new Error('Cannot find funding rate provider address');
}

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

function getMinCollateralization(network: Network) {
  // if (network === Network.Ethereum || network===Network.Goerli) {
  return '1075000000000000000'; // 107.5%
  // }
  // throw new Error('Cannot find minimum collateralization');
}

function getInsuranceFundAddress(network: Network) {
  // if (network === Network.Ethereum) {
  // return '0x75ef8432566A79C86BBF207A47df3963B8Cf0753';
  // }

  // if(network===Network.Goerli){
  return process.env.DEPLOYER_ACCOUNT as string;
  // }
  // throw new Error('Cannot find insurance fund address');
}

function getInsuranceFee(network: Network) {
  // if (network === Network.Ethereum || network===Network.Goerli) {
  return '200000000000000000'; // 20%
  // }
  // throw new Error('Cannot find insurance fund fee');
}

function getWethAddress(network: Network) {
  if (network === Network.Ethereum) {
    return '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  }

  if (network === Network.Goerli) {
    return '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6';
  }

  if (network === Network.OKC) {
    return '';
  }
  throw new Error('Cannot find WETH address');
}

function getTokenAddress(network: Network) {
  if (network === Network.Ethereum) {
    return '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // USDC
  }
  throw new Error('Cannot find token address');
}

function getMakerPriceOracleAddress(network: Network) {
  if (network === Network.Ethereum) {
    return '0x064409168198A7E9108036D072eF59F923dEDC9A';
  }
  if (network === Network.Kovan) {
    return '0xf8A9Faa25186B14EbF02e7Cd16e39152b85aEEcd';
  }
  throw new Error('Cannot find Maker price oracle');
}

function getOracleAdjustment(network: Network) {
  // if (network === Network.Ethereum || network===Network.Goerli) {
  return 18; // 1e18
  // }
  // throw new Error('Cannot find oracle adjustment');
}

export {
  getMinCollateralization,
  getInsuranceFee,
  getInsuranceFundAddress,
  getWethAddress,
  getTokenAddress,
  getFundingRateProviderAddress,
  getMakerPriceOracleAddress,
  getOracleAdjustment,
};
