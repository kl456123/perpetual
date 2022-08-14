import Koa from 'koa';
import cors from '@koa/cors';
import { createRootRoutes } from './routers';
import bodyParser from 'koa-bodyparser';
import { ethers } from 'ethers';
import { logger } from './logger';
import { Connection } from 'typeorm';
import { getDBConnectionAsync } from './db_connection';
import { addressNormalizer } from './middleware/address_normalizer';
import {
  HttpServiceConfig,
  SupportedProvider,
  ContractAddresses,
  WebsocketSRAOpts,
  ChainId,
  ApiMarketName,
} from './types';
import { OrderBookService } from './services/orderbook_service';
import { AccountService } from './services/account_service';
import { Perpetual } from './perpetual';
import { CHAIN_ID, WEBSOCKET_ORDER_UPDATES_PATH } from './config';

export interface AppDependencies {
  contractAddresses: ContractAddresses;
  connection: Connection;
  orderBookService: OrderBookService;
  accountService: AccountService;
  provider: SupportedProvider;
  websocketOpts: Partial<WebsocketSRAOpts>;
}

export async function getAppAsync(
  dependencies: AppDependencies,
  config: HttpServiceConfig
) {
  const app = new Koa();

  app.use(cors());
  app.use(bodyParser());

  // transform all values of `req.query.[xx]Address` to lowercase
  app.use(addressNormalizer);

  app.use(createRootRoutes(dependencies));

  app.listen(config.httpPort, () => {
    logger.log(`server is running at ${config.httpPort}`);
  });
  return app;
}

async function getContractAddressesForNetworkOrThrowAsync(chainId: ChainId) {
  const chainToAddresses: { [chainId: number]: ContractAddresses } = {
    [ChainId.Mainnet]: { p1order: '', perpetualProxy: '' },
  };
  return chainToAddresses[chainId];
}

export async function getDefaultAppDependenciesAsync(
  provider: ethers.providers.JsonRpcProvider,
  config: HttpServiceConfig
): Promise<AppDependencies> {
  const contractAddresses = await getContractAddressesForNetworkOrThrowAsync(
    CHAIN_ID
  );
  const connection = await getDBConnectionAsync();

  const perpetual = new Perpetual(provider, ApiMarketName.PBTC_USDC);
  const orderBookService = new OrderBookService(connection, perpetual);
  const accountService = new AccountService(perpetual);

  const websocketOpts = { path: WEBSOCKET_ORDER_UPDATES_PATH };
  return {
    contractAddresses,
    connection,
    orderBookService,
    accountService,
    provider,
    websocketOpts,
  };
}
