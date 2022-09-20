import { Perpetual } from '../src/perpetual';
import { ethers } from 'ethers';
import {
  ApiMarketName,
  ApiSide,
  SignedOrder,
  Price,
  Fee,
  address,
} from '../src/types';
import BigNumber from 'bignumber.js';
import { WalletProvider } from '../src/wallet_provider';

async function fillOrder(
  perpetual: Perpetual,
  order: SignedOrder,
  fillArgs: {
    amount?: BigNumber;
    price?: Price;
    fee?: Fee;
    sender?: address;
  } = {}
): Promise<void> {
  const fillAmount = (fillArgs.amount || order.amount).dp(
    0,
    BigNumber.ROUND_DOWN
  );
  const fillPrice = fillArgs.price || order.limitPrice;
  const fillFee = fillArgs.fee || order.limitFee;
  const sender = fillArgs.sender || order.taker;

  // Fill the order.
  const txResult = await perpetual.trade
    .initiate()
    .fillSignedOrder(sender, order, fillAmount, fillPrice, fillFee)
    .commit({ from: sender });
}

async function checkBalance(perpetual: Perpetual, makerAddr: address) {
  const makerBalance =
    (await perpetual.contracts.perpetualProxy.getAccountBalance(makerAddr)) as {
      marginIsPositive: boolean;
      positionIsPositive: boolean;
      margin: BigNumber;
      position: BigNumber;
    };
  const margin = makerBalance.marginIsPositive
    ? new BigNumber(makerBalance.margin.toString())
    : new BigNumber(makerBalance.margin.toString()).negated();
  const position = makerBalance.positionIsPositive
    ? new BigNumber(makerBalance.position.toString())
    : new BigNumber(makerBalance.position.toString()).negated();
  console.log(
    `account ${makerAddr}: margin=${margin.toString()}, position=${position.toString()}`
  );
}

async function checkOrder(order: SignedOrder) {
  const json = {
    amount: order.amount.toString(),
    expiration: order.expiration.toString(),
    isBuy: order.isBuy,
    isDecreaseOnly: order.isDecreaseOnly,
    limitFee: order.limitFee.toString(),
    limitPrice: order.limitPrice.toString(),
    maker: order.maker,
    taker: order.taker,
    triggerPrice: order.triggerPrice.toString(),
    salt: order.salt.toFixed(0).toString(),
  };
  console.log(json);
}

async function main() {
  const url = 'http://localhost:8545';
  const provider = new ethers.providers.JsonRpcProvider(url);
  const market = ApiMarketName.PBTC_USDC;
  const makerWallet = provider.getSigner(
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  );
  const takerWallet = provider.getSigner(
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
  );
  const walletProvider = new WalletProvider(provider);
  walletProvider.unlockAll([
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  ]);

  const perpetual = new Perpetual(walletProvider, market, 31337);
  const mintAmount = ethers.utils.parseUnits('1000', 6); // 1000 margin token

  // mint margin token first
  await perpetual.contracts.marginToken
    .connect(makerWallet)
    .mint(makerWallet._address, mintAmount);
  await perpetual.contracts.marginToken
    .connect(makerWallet)
    .mint(takerWallet._address, mintAmount);

  // deposit margin token to perpetual
  const max = ethers.constants.MaxUint256;
  await perpetual.contracts.marginToken
    .connect(makerWallet)
    .approve(perpetual.contracts.perpetualProxy.address, max);
  await perpetual.contracts.marginToken
    .connect(takerWallet)
    .approve(perpetual.contracts.perpetualProxy.address, max);
  await perpetual.contracts.perpetualProxy
    .connect(makerWallet)
    .deposit(makerWallet._address, mintAmount);
  await perpetual.contracts.perpetualProxy
    .connect(takerWallet)
    .deposit(takerWallet._address, mintAmount);

  const FOUR_WEEKS_IN_SECONDS = 60 * 60 * 24 * 28;
  const expiration = new BigNumber(FOUR_WEEKS_IN_SECONDS);
  const price = new BigNumber('18700');
  const amount = new BigNumber(
    mintAmount.mul(4).div(price.toString()).toString()
  );
  const sellOrder = await perpetual.api.createPerpetualOrder({
    market,
    side: ApiSide.SELL,
    amount,
    price,
    maker: makerWallet._address,
    taker: takerWallet._address,
    expiration,
    postOnly: true,
  });
  checkOrder(sellOrder);

  console.log('-----check balance before------');
  await checkBalance(perpetual, makerWallet._address);
  await checkBalance(perpetual, takerWallet._address);

  console.log(`---------order matching before---------`);
  console.log(
    `taker(${takerWallet._address}) buy ${amount} amount of position from maker(${makerWallet._address}) with margin`
  );
  await fillOrder(perpetual, sellOrder);
  console.log(`---------order matching after---------`);

  console.log('------check balance after------');
  await checkBalance(perpetual, makerWallet._address);
  await checkBalance(perpetual, takerWallet._address);
}

main().catch(console.error);
