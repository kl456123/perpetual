import { ethers } from 'hardhat';
import { DEPLOYER_ACCOUNT, DELEVERAGING_ACCOUNT } from '../src/config';
import { saveDeploymentsAddress, DeploymentsAddress } from '../src/addresses';

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
  return DEPLOYER_ACCOUNT;
  // }
  // throw new Error('Cannot find Deployer address');
}

export function getDeleveragingOperatorAddress(network: Network) {
  // if (network === Network.Ethereum || network===Network.Goerli) {
  return DELEVERAGING_ACCOUNT; // TODO
  // }

  // throw new Error('Cannot find funding rate provider address');
}

function getFundingRateProviderAddress(network: Network) {
  // if (network === Network.Ethereum) {
  // return '0xe5E98525553d8a20d77211F4db4DC1f599515FF3';
  // }

  // if(network===Network.Goerli){
  return DEPLOYER_ACCOUNT as string;
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
  return DEPLOYER_ACCOUNT as string;
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

async function deployProtocol(
  network: Network,
  addressBook: Record<string, string>
) {
  const perpetualV1 = await deployContract('PerpetualV1');

  const deployer = (await ethers.getSigners())[0];
  const perpetualProxy = await deployContract(
    'PerpetualProxy',
    perpetualV1.address,
    deployer.address,
    '0x'
  );

  addressBook['PerpetualV1'] = perpetualV1.address;
  addressBook['PerpetualProxy'] = perpetualProxy.address;
}

async function deployOracles(
  perpetualProxyAddr: string,
  network: Network,
  addressBook: Record<string, string>
) {
  const chainlinkOracle = await deployContract('Test_ChainlinkAggregator');
  // set fake price in decimal 18
  await chainlinkOracle.setAnswer(ethers.utils.parseUnits('18200', 18));

  const fundingOracle = await deployContract(
    'P1FundingOracle',
    getFundingRateProviderAddress(network)
  );

  const p1ChainlinkOracle = await deployContract(
    'P1ChainlinkOracle',
    chainlinkOracle.address,
    perpetualProxyAddr,
    getOracleAdjustment(network)
  );

  addressBook['P1FundingOracle'] = fundingOracle.address;
  addressBook['P1MakerOracle'] = p1ChainlinkOracle.address;
  addressBook['Test_ChainlinkAggregator'] = chainlinkOracle.address;
}

async function deployTraders(
  perpetualProxyAddr: string,
  network: Network,
  addressBook: Record<string, string>
) {
  // deploy traders
  const p1Orders = await deployContract(
    'P1Orders',
    perpetualProxyAddr,
    network
  );
  const p1InverseOrders = await deployContract(
    'P1InverseOrders',
    perpetualProxyAddr,
    network
  );
  const p1Deleveraging = await deployContract(
    'P1Deleveraging',
    perpetualProxyAddr,
    getDeleveragingOperatorAddress(network)
  );

  const p1Liquidation = await deployContract(
    'P1Liquidation',
    perpetualProxyAddr
  );

  // deploy proxies
  const p1CurrencyConverterProxy = await deployContract(
    'P1CurrencyConverterProxy'
  );

  const p1LiquidatorProxy = await deployContract(
    'P1LiquidatorProxy',
    perpetualProxyAddr,
    p1Liquidation.address,
    getInsuranceFundAddress(network),
    getInsuranceFee(network)
  );

  const weth9 = await deployContract('WETH9');
  const p1WethProxy = await deployContract('P1WethProxy', weth9.address);

  // initialize proxies
  await p1CurrencyConverterProxy.approveMaximumOnPerpetual(perpetualProxyAddr);

  await p1LiquidatorProxy.approveMaximumOnPerpetual();

  await p1WethProxy.approveMaximumOnPerpetual(perpetualProxyAddr);

  // approval
  const perpetual = await ethers.getContractAt(
    'PerpetualV1',
    perpetualProxyAddr
  );

  const globalOperators = [
    p1Orders.address,
    p1InverseOrders.address,
    p1Deleveraging.address,
    p1Liquidation.address,
    p1CurrencyConverterProxy.address,
    p1LiquidatorProxy.address,
    p1WethProxy.address,
  ];
  for (const globalOperator of globalOperators) {
    await perpetual.setGlobalOperator(globalOperator, true);
  }

  addressBook['P1Orders'] = p1Orders.address;
  addressBook['P1Liquidation'] = p1Liquidation.address;
  addressBook['P1Deleveraging'] = p1Deleveraging.address;
  addressBook['P1CurrencyConverterProxy'] = p1CurrencyConverterProxy.address;
  addressBook['P1WethProxy'] = p1WethProxy.address;
  addressBook['P1LiquidatorProxy'] = p1LiquidatorProxy.address;
}

async function initializePerpetual(
  perpetualProxyAddr: string,
  priceOracleAddr: string,
  fundingOracleAddr: string,
  marginTokenAddr: string,
  network: Network
) {
  const perpetual = await ethers.getContractAt(
    'PerpetualV1',
    perpetualProxyAddr
  );

  await perpetual.initializeV1(
    marginTokenAddr,
    // getTokenAddress(network),
    priceOracleAddr,
    fundingOracleAddr,
    getMinCollateralization(network)
  );
}

export async function deploy(save = false) {
  const { chainId } = await ethers.provider.getNetwork();
  const network = chainId;
  const addressBook: Record<string, string> = {};
  // deploy perpetual
  await deployProtocol(network, addressBook);
  const perpetualProxyAddr = addressBook['PerpetualProxy'];
  await deployOracles(perpetualProxyAddr, network, addressBook);
  const fundingOracleAddr = addressBook['P1FundingOracle'];
  const priceOracleAddr = addressBook['P1MakerOracle'];

  // deploy USDC token contract in dev
  const tokenContract = await deployContract(
    'MockToken',
    'USD Center',
    'USDC',
    6
  );
  addressBook['MarginToken'] = tokenContract.address;
  await initializePerpetual(
    perpetualProxyAddr,
    priceOracleAddr,
    fundingOracleAddr,
    tokenContract.address,
    network
  );
  await deployTraders(perpetualProxyAddr, network, addressBook);

  // save all contracts addresses
  const deployments: DeploymentsAddress = {
    [network]: addressBook,
  };
  if (save) {
    saveDeploymentsAddress(deployments, './deployments');
  }
  return addressBook;
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
