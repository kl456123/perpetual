import { Entity, PrimaryColumn, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'account' })
export class AccountEntity {
  @PrimaryGeneratedColumn()
  address: string;

  @Column()
  margin: number;

  @Column()
  position: number;

  @Column()
  isLiquidatable: boolean;

  @Column()
  timestamp: string;

  constructor(
    opts: {
      address?: string;
      isLiquidatable?: boolean;
      timestamp?: string;
    } = {}
  ) {
    Object.assign(this, opts);
  }
}
