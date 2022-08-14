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
} from '../typechain-types';
import { ethers } from 'ethers';
import { DeploymentsAddress } from './addresses';
import deploymentsJSON from '../deployments/deployments.json';
import { ApiMarketName } from './types';

export class Contracts {
  public p1Orders: P1Orders;
  public perpetualV1: PerpetualV1;
  public perpetualProxy: ethers.Contract;
  public marginToken: MockToken;
  public priceOracle: P1MakerOracle;
  public fundingOracle: P1FundingOracle;

  public market: ApiMarketName;
  public networkId: number;

  constructor(
    provider: ethers.providers.JsonRpcProvider,
    market: ApiMarketName,
    networkId: number
  ) {
    const addressBook = (deploymentsJSON as DeploymentsAddress)[networkId];
    this.p1Orders = P1Orders__factory.connect(addressBook.P1Orders, provider);
    this.perpetualV1 = PerpetualV1__factory.connect(
      addressBook.PerpetualV1,
      provider
    );

    this.perpetualProxy = new ethers.Contract(
      addressBook.PerpetualProxy,
      PerpetualV1__factory.abi,
      provider
    );
    this.marginToken = MockToken__factory.connect(
      addressBook.MarginToken,
      provider
    );
    this.priceOracle = P1MakerOracle__factory.connect(
      addressBook.P1MakerOracle,
      provider
    );
    this.fundingOracle = P1FundingOracle__factory.connect(
      addressBook.P1FundingOracle,
      provider
    );
    this.market = market;
    this.networkId = networkId;
  }
}
