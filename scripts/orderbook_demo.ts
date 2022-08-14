import { logger } from '../src/logger';
import axios from 'axios';
import { ethers, Wallet } from 'ethers';
import { JsonRpcSigner } from '@ethersproject/providers';
import { ApiMarketName, ApiSide } from '../src/types';
import { Perpetual } from '../src/perpetual';
import BigNumber from 'bignumber.js';
import { jsonifyPerpetualOrder } from '../src/utils';
import { NULL_ADDRESS } from '../src/constants';

const baseUrl = `http://localhost:3000`;

async function getRequest(url: string, query: any) {
  const res = await axios.get(url, { params: query });
  const quoteRes = res.data;
  logger.info(quoteRes);
}

async function getOrders(query) {
  const url = `${baseUrl}/orderbook/v1/order`;
  await getRequest(url, query);
}

async function getTradeHistory(query) {
  const url = `${baseUrl}/orderbook/v1/tradesHistory`;
  await getRequest(url, query);
}

async function postOrder(orderData) {
  const url = `${baseUrl}/orderbook/v1/order`;
  try {
    const res = await axios.post(url, orderData);
    const quoteRes = res.data;
    logger.info(quoteRes);
  } catch (error: any) {
    logger.fatal(`${error.response.data.error}`);
  }
}

async function prepareMoney(perpetual: Perpetual, wallets: JsonRpcSigner[]) {
  const mintAmount = ethers.utils.parseUnits('1000000', 6); // 1000 margin token

  // the first one has permission to mint token
  const mintWallet = wallets[0];
  // mint margin token first
  await Promise.all(
    wallets.map(wallet =>
      perpetual.contracts.marginToken
        .connect(mintWallet)
        .mint(wallet._address, mintAmount)
    )
  );

  // deposit margin token to perpetual
  const max = ethers.constants.MaxUint256;
  await Promise.all(
    wallets.map(async wallet => {
      await perpetual.contracts.marginToken
        .connect(wallet)
        .approve(perpetual.contracts.perpetualProxy.address, max);
      await perpetual.contracts.perpetualProxy
        .connect(wallet)
        .deposit(wallet._address, mintAmount);
    })
  );
}

async function prepareOrders(
  perpetual: Perpetual,
  makerWallet: JsonRpcSigner,
  takerWallet: JsonRpcSigner
) {
  const market = ApiMarketName.PBTC_USDC;
  const mintAmount = new BigNumber(
    ethers.utils.parseUnits('10000', 6).toString()
  ); // 1000 margin token

  const orders = [];
  const base = new BigNumber(10).pow(16);

  //////////////////////////// sell orders //////////////////////////////
  {
    const prices = ['192.59', '187.84', '185.12'];
    const rates = [1, 2, 3];
    const sellOrders = await Promise.all(
      prices.map((price, ind) => {
        return perpetual.api.createPerpetualOrder({
          market,
          side: ApiSide.SELL,
          amount: mintAmount.times(rates[ind]).div(price).toString(),
          price,
          maker: makerWallet._address,
          taker: NULL_ADDRESS,
          limitFee: new BigNumber(0),
        });
      })
    );
    orders.push(...sellOrders);
  }

  //////////////////////////// buy orders //////////////////////////////
  {
    const prices = ['182.27', '180.36', '178.90'].map(price =>
      base.times(price)
    );
    const rates = [1, 2, 3];

    const buyOrders = await Promise.all(
      prices.map((price, ind) => {
        return perpetual.api.createPerpetualOrder({
          market,
          side: ApiSide.BUY,
          amount: mintAmount.times(rates[ind]).div(price).toString(),
          price,
          maker: takerWallet._address,
          taker: NULL_ADDRESS,
          limitFee: new BigNumber(0),
        });
      })
    );

    orders.push(...buyOrders);
  }

  await Promise.all(
    orders.map(order => postOrder(jsonifyPerpetualOrder(order)))
  );
}

async function fillOrder(perpetual: Perpetual, takerWallet: JsonRpcSigner) {
  const market = ApiMarketName.PBTC_USDC;
  const marginAmount = ethers.utils.parseUnits('10000', 6).toString(); // 1000 margin token
  const price = new BigNumber('193.25');
  const amount = new BigNumber(marginAmount)
    .times(2)
    .div(price.toString().toString()); // position amount
  const takerOrder = await perpetual.api.createPerpetualOrder({
    market,
    side: ApiSide.BUY,
    amount,
    price,
    maker: takerWallet._address,
    taker: NULL_ADDRESS,
    limitFee: new BigNumber(0),
  });

  await postOrder(jsonifyPerpetualOrder(takerOrder));
}

async function main() {
  const url = 'http://localhost:8545';
  const provider = new ethers.providers.JsonRpcProvider(url);
  const market = ApiMarketName.PBTC_USDC;
  const perpetual = new Perpetual(provider, market);
  const sellerWallet = provider.getSigner(
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  );
  const buyerWallet = provider.getSigner(
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
  );
  const takerWallet = provider.getSigner(
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
  );

  await prepareMoney(perpetual, [sellerWallet, buyerWallet, takerWallet]);
  await prepareOrders(perpetual, sellerWallet, buyerWallet);

  // fill orderbook, taker will buy all ask orders in orderbook actually
  await fillOrder(perpetual, takerWallet);

  await getTradeHistory({});
}

main().catch(err => logger.error(err.stack));
