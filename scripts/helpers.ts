import { ethers } from 'hardhat';

export enum Network {
  Ethereum = 1,
  BSC = 56,
  OKC = 66,
}

export function getDeployerAddress(network: Network) {
  if (network === Network.Ethereum) {
    return process.env.DEPLOYER_ACCOUNT as string;
  }
  throw new Error('Cannot find Deployer address');
}

export function getDeleveragingOperatorAddress(network: Network) {
  if (network === Network.Ethereum) {
    return process.env.DELEVERAGING_ACCOUNT as string; // TODO
  }

  throw new Error('Cannot find funding rate provider address');
}

function getFundingRateProviderAddress(network: Network) {
  if (network === Network.Ethereum) {
    return '0xe5E98525553d8a20d77211F4db4DC1f599515FF3';
  }
  throw new Error('Cannot find funding rate provider address');
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
  if (network === Network.Ethereum) {
    return '1075000000000000000'; // 107.5%
  }
  throw new Error('Cannot find minimum collateralization');
}

function getInsuranceFundAddress(network: Network) {
  if (network === Network.Ethereum) {
    return '0x75ef8432566A79C86BBF207A47df3963B8Cf0753';
  }
  throw new Error('Cannot find insurance fund address');
}

function getInsuranceFee(network: Network) {
  if (network === Network.Ethereum) {
    return '200000000000000000'; // 20%
  }
  throw new Error('Cannot find insurance fund fee');
}

function getWethAddress(network: Network) {
  if (network === Network.Ethereum) {
    return '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
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
  throw new Error('Cannot find Maker price oracle');
}

function getOracleAdjustment(network: Network) {
  if (network === Network.Ethereum) {
    return '10000000000000000'; // 0.01e18
  }
  throw new Error('Cannot find oracle adjustment');
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
