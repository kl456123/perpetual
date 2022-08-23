import EventEmitter from 'events';
import { SRAOrder, EventType, TradeHistory } from './types';

export class EventManager extends EventEmitter {
  public emitOrder(sraOrder: SRAOrder) {
    this.emit(EventType.Order, sraOrder);
  }

  public emitTradeRecord(tradeHistory: TradeHistory) {
    this.emit(EventType.TradeRecord, tradeHistory);
  }
}

export const eventManager = new EventManager();
