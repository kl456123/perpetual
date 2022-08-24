import { ethers } from 'hardhat';
import { saveDeploymentsAddress, DeploymentsAddress } from '../src/addresses';
import {
  Network,
  getDeployerAddress,
  getDeleveragingOperatorAddress,
  deployContract,
  getInsuranceFee,
  getInsuranceFundAddress,
  getWethAddress,
  getTokenAddress,
  getMinCollateralization,
  getFundingRateProviderAddress,
  getMakerPriceOracleAddress,
  getOracleAdjustment,
} from './helpers';

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

async function main() {
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
  saveDeploymentsAddress(deployments, './deployments');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
