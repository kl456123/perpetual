import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'trade_history' })
export class TradeHistoryEntity {
  @PrimaryColumn()
  public hash: string;

  @Column()
  taker: string;

  @Column()
  amount: string;

  @Column()
  price: string;

  @Column()
  timestamp: string;

  @Column({ name: 'block_number' })
  blockNumber: number;

  constructor(
    opts: {
      hash?: string;
      taker?: string;
      amount?: string;
      price?: string;
      timestamp?: string;
      blockNumber?: number;
    } = {}
  ) {
    Object.assign(this, opts);
  }
}
