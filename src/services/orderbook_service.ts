import { Connection, In, MoreThanOrEqual } from 'typeorm';
import {
  OrderbookResponse,
  SRAOrder,
  SignedOrder,
  PaginatedCollection,
  ApiMarketName,
  OrderStatus,
  SRAOrderMetaData,
  TradeHistory,
  Price,
  ApiMarketMessage,
} from '../types';
import * as _ from 'lodash';
import { SignedOrderEntity, TradeHistoryEntity } from '../entities';
import { paginationUtils, orderUtils } from '../utils';
import { ONE_SECOND_MS } from '../constants';
import { SRA_ORDER_EXPIRATION_BUFFER_SECONDS } from '../config';
import { BigNumber } from 'bignumber.js';
import { Perpetual } from '../perpetual';
import { logger } from '../logger';
import { OPERATOR_ADDRESS } from '../config';
import { calculateFundingrate } from '../utils';

export class OrderBookService {
  constructor(
    private readonly connection: Connection,
    private readonly perpetual: Perpetual
  ) {}

  public async getOrderByHashIfExistsAsync(
    orderHash: string
  ): Promise<SRAOrder | undefined> {
    const signedOrderEntity = await this.connection.manager.findOneBy(
      SignedOrderEntity,
      { hash: orderHash }
    );
    if (signedOrderEntity === undefined) {
      return undefined;
    } else {
      return orderUtils.deserializeOrderToSRAOrder(
        signedOrderEntity as Required<SignedOrderEntity>
      );
    }
  }

  public async getMarkets(): Promise<{ markets: ApiMarketMessage[] }> {
    const indexPrice = await this.getIndexPriceAsync();
    const fundingRate = await this.perpetual.fundingOracle.getFundingRate();
    const globalIndex =
      await this.perpetual.contracts.perpetualProxy.getGlobalIndex();
    const globalIndexValue = new BigNumber(globalIndex.value.toString());

    const apiMarketMessage = {
      createdAt: '0', // TODO fix it
      updatedAt: '0',
      market: this.perpetual.contracts.market,
      oraclePrice: indexPrice.toString(),
      fundingRate: fundingRate.value.toString(),
      globalIndexValue: globalIndex.isPositive
        ? globalIndexValue.toString()
        : globalIndexValue.negated().toString(),
      globalIndexTimeStamp: globalIndex.timestamp.toString(),
    };

    return { markets: [apiMarketMessage] };
  }

  public async quoteAsync(amount: BigNumber, isBuy: boolean) {
    const allOrders = (
      (await this.connection.manager.findBy(SignedOrderEntity, {
        isBuy,
      })) as Required<SignedOrderEntity>[]
    )
      .map(orderUtils.deserializeOrderToSRAOrder)
      .filter(orderUtils.isFreshOrder) // no expiry
      .filter(order => order.metaData.filledAmount.lt(order.order.amount)); // fillable

    if (isBuy) {
      allOrders.sort((orderA, orderB) =>
        orderUtils.compareBidOrder(orderA.order, orderB.order)
      );
    } else {
      allOrders.sort((orderA, orderB) =>
        orderUtils.compareBidOrder(orderA.order, orderB.order)
      );
    }

    let totalVolume = new BigNumber(0);
    let remainingAmount = amount;
    for (let i = 0; i < allOrders.length; ++i) {
      if (remainingAmount.lte(0)) {
        break;
      }
      const remainingAmountForApiOrder = allOrders[i].order.amount.minus(
        allOrders[i].metaData.filledAmount
      );
      const tradedAmount = BigNumber.minimum(
        remainingAmount,
        remainingAmountForApiOrder
      );
      totalVolume = totalVolume.plus(
        tradedAmount.times(allOrders[i].order.limitPrice.value)
      );
      remainingAmount = remainingAmount.minus(tradedAmount);
    }

    const totalTradedAmount = amount.minus(remainingAmount);
    const price = totalTradedAmount.eq(0)
      ? new BigNumber(0)
      : totalVolume.div(totalTradedAmount);
    return {
      price,
      filledAmount: totalTradedAmount,
      fulfilled: remainingAmount.eq(0),
    };
  }

  public async getTradesHistoryAsync(page: number, perPage: number) {
    const [total, tradeHistoryEntities] = await Promise.all([
      this.connection.manager.count(TradeHistoryEntity),
      this.connection.manager.find(TradeHistoryEntity, {
        ...paginationUtils.paginateDBFilters(page, perPage),
        order: {
          hash: 'ASC',
        },
      }),
    ]);

    const tradesHistory: TradeHistory[] = tradeHistoryEntities.map(entity => ({
      ...entity,
      amount: new BigNumber(entity.amount),
      price: new Price(entity.price),
      timestamp: new BigNumber(entity.timestamp),
    }));

    const paginatedTradesHistory = paginationUtils.paginateSerialize(
      tradesHistory,
      total,
      page,
      perPage
    );
    return paginatedTradesHistory;
  }

  public async getIndexPriceAsync() {
    const indexPrice = await this.perpetual.contracts.priceOracle.getPrice();
    return new BigNumber(indexPrice.toString()).div(1e18);
  }

  public async getFundingRate() {
    // trade on orderbook valued by 50000 USDC
    const indexPrice = await this.getIndexPriceAsync();
    const amount = new BigNumber('50000').div(indexPrice);
    const askQuoteRes = await this.quoteAsync(amount, false);
    const bidQuoteRes = await this.quoteAsync(amount, true);
    const fundingRatePerSecond = calculateFundingrate(
      [askQuoteRes.price],
      [bidQuoteRes.price],
      [indexPrice]
    );
    return {
      fundingRatePerSecond,
      timestamp: Math.round(new Date().getTime() / 1000).toFixed(0),
    };
  }

  // tslint:disable-next-line:prefer-function-over-method
  public async getOrderBookAsync(
    page: number,
    perPage: number,
    market: ApiMarketName
  ): Promise<OrderbookResponse> {
    const orderEntities = await this.connection.manager.find(SignedOrderEntity);
    const bidSignedOrderEntities = orderEntities.filter(o => o.isBuy);
    const askSignedOrderEntities = orderEntities.filter(o => !o.isBuy);
    const bidApiOrders: SRAOrder[] = (
      bidSignedOrderEntities as Required<SignedOrderEntity>[]
    )
      .map(orderUtils.deserializeOrderToSRAOrder)
      .filter(orderUtils.isFreshOrder)
      .sort((orderA, orderB) =>
        orderUtils.compareBidOrder(orderA.order, orderB.order)
      );
    const askApiOrders: SRAOrder[] = (
      askSignedOrderEntities as Required<SignedOrderEntity>[]
    )
      .map(orderUtils.deserializeOrderToSRAOrder)
      .filter(orderUtils.isFreshOrder)
      .sort((orderA, orderB) =>
        orderUtils.compareAskOrder(orderA.order, orderB.order)
      );

    const paginatedBidApiOrders = paginationUtils.paginate(
      bidApiOrders,
      page,
      perPage
    );
    const paginatedAskApiOrders = paginationUtils.paginate(
      askApiOrders,
      page,
      perPage
    );
    return {
      bids: paginatedBidApiOrders,
      asks: paginatedAskApiOrders,
    };
  }

  public async fulfillOrderAsync(signedOrder: SignedOrder) {
    // try to match it with orders in orderbook first
    const allOrders = (
      (await this.connection.manager.findBy(SignedOrderEntity, {
        isBuy: !signedOrder.isBuy,
      })) as Required<SignedOrderEntity>[]
    )
      .map(orderUtils.deserializeOrderToSRAOrder)
      .filter(orderUtils.isFreshOrder) // no expiry
      .filter(order => order.metaData.filledAmount.lt(order.order.amount)) // fillable
      .filter(order =>
        signedOrder.isBuy
          ? order.order.limitPrice.value.lte(signedOrder.limitPrice.value)
          : order.order.limitPrice.value.gt(signedOrder.limitPrice.value)
      ); // price matched

    let remainingAmount = signedOrder.amount;
    if (allOrders.length && remainingAmount.gt(0)) {
      logger.info(`order matched`);
      const tradeOperation = this.perpetual.trade.initiate();
      let apiOrders: SRAOrder[];
      if (!signedOrder.isBuy) {
        apiOrders = allOrders.sort((orderA, orderB) =>
          orderUtils.compareBidOrder(orderA.order, orderB.order)
        );
      } else {
        apiOrders = allOrders.sort((orderA, orderB) =>
          orderUtils.compareAskOrder(orderA.order, orderB.order)
        );
      }

      const updatedOrders = [];
      let totalVolume = new BigNumber(0);
      for (let i = 0; i < apiOrders.length; ++i) {
        if (remainingAmount.lte(0)) {
          break;
        }

        const signedMakerOrder = apiOrders[i].order;
        const remainingAmountForApiOrder = apiOrders[i].order.amount.minus(
          apiOrders[i].metaData.filledAmount
        );
        const tradedAmount = BigNumber.minimum(
          remainingAmount,
          remainingAmountForApiOrder
        );
        totalVolume = totalVolume.plus(
          tradedAmount.times(signedMakerOrder.limitPrice.value)
        );
        remainingAmount = remainingAmount.minus(tradedAmount);
        // fill maker order by operator
        tradeOperation.fillSignedOrder(
          OPERATOR_ADDRESS,
          signedMakerOrder,
          tradedAmount,
          signedMakerOrder.limitPrice,
          signedMakerOrder.limitFee
        );
        // fill taker order by operator
        tradeOperation.fillSignedOrder(
          OPERATOR_ADDRESS,
          signedOrder,
          tradedAmount,
          signedMakerOrder.limitPrice,
          signedMakerOrder.limitFee
        );

        // update filledAmount of filled orders in orderbook
        apiOrders[i].metaData.filledAmount =
          apiOrders[i].metaData.filledAmount.plus(tradedAmount);
        updatedOrders.push(orderUtils.serializeOrder(apiOrders[i]));
      }
      const totalTradedAmount = signedOrder.amount.minus(remainingAmount);
      const txRes = await tradeOperation.commit({ from: OPERATOR_ADDRESS });
      const txRecipient = await txRes.wait();

      // update orderbook after tx success first
      await Promise.all(
        updatedOrders.map(updatedOrder =>
          this.connection.manager.save(updatedOrder)
        )
      );

      // add current trade to history
      const tradeHistory = new TradeHistoryEntity({
        taker: signedOrder.maker,
        hash: txRecipient.transactionHash,
        blockNumber: txRecipient.blockNumber,
        timestamp: Math.round(new Date().getTime() / 1000).toFixed(0),
        price: totalVolume.div(totalTradedAmount).toFixed(2),
        amount: totalTradedAmount.toFixed(0),
      });
      await this.connection.manager.save(tradeHistory);
    }

    return signedOrder.amount.minus(remainingAmount);
  }

  public async addOrderAsync(
    signedOrder: SignedOrder,
    filledAmount = new BigNumber(0)
  ): Promise<void> {
    const orderHash = this.perpetual.orders.getOrderHash(signedOrder);
    const metaData: SRAOrderMetaData = {
      orderHash,
      filledAmount,
      state: OrderStatus.Null,
      createdAt: Math.round(new Date().getTime() / 1000).toString(),
    };
    const apiOrder = {
      order: signedOrder,
      metaData,
    };
    const signedOrderEntity = orderUtils.serializeOrder(apiOrder);
    await this.connection.manager.save(signedOrderEntity);
  }

  public async getOrdersAsync(
    page: number,
    perPage: number,
    orderFieldFilters: Partial<SignedOrderEntity>,
    additionalFilters: { isUnfillable?: boolean; trader?: string }
  ): Promise<PaginatedCollection<SRAOrder>> {
    // Each array element in `filters` is an OR subclause
    const filters = [];

    // Pre-filters; exists in the entity verbatim
    const columnNames = this.connection
      .getMetadata(SignedOrderEntity)
      .columns.map(x => x.propertyName);
    const orderFilter = _.pickBy(orderFieldFilters, (v, k) => {
      return columnNames.includes(k);
    });

    // Post-filters; filters that don't exist verbatim
    if (additionalFilters.trader) {
      filters.push({
        ...orderFilter,
        maker: additionalFilters.trader,
      });

      filters.push({
        ...orderFilter,
        taker: additionalFilters.trader,
      });
    } else {
      filters.push(orderFilter);
    }

    // Add an expiry time check to all filters
    const minExpiryTime =
      Math.floor(Date.now() / ONE_SECOND_MS) +
      SRA_ORDER_EXPIRATION_BUFFER_SECONDS;
    const filtersWithExpirationCheck = filters.map(filter => ({
      ...filter,
      expiration: MoreThanOrEqual(minExpiryTime),
    }));

    const [signedOrderCount, signedOrderEntities] = await Promise.all([
      this.connection.manager.count(SignedOrderEntity, {
        where: filtersWithExpirationCheck,
      }),
      this.connection.manager.find(SignedOrderEntity, {
        where: filtersWithExpirationCheck,
        ...paginationUtils.paginateDBFilters(page, perPage),
        order: {
          hash: 'ASC',
        },
      }),
    ]);
    const apiOrders = (
      signedOrderEntities as Required<SignedOrderEntity>[]
    ).map(orderUtils.deserializeOrderToSRAOrder);

    const allOrders = apiOrders;
    const total = signedOrderCount;
    // Paginate
    const paginatedApiOrders = paginationUtils.paginateSerialize(
      allOrders,
      total,
      page,
      perPage
    );
    return paginatedApiOrders;
  }
}
