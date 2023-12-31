import { ethers, Wallet } from 'ethers';
import { logger } from './logger';

export class WalletProvider {
  protected walletByAddress: Record<string, Wallet> = {};
  constructor(public provider: ethers.providers.BaseProvider) {}

  public listAccounts() {
    return Object.keys(this.walletByAddress);
  }

  public unlock(passwd: string) {
    if (passwd === undefined) {
      throw new Error(`password is undefined`);
    }
    const wallet = new Wallet(passwd, this.provider);
    const accountAddress = wallet.address;
    if (this.has(accountAddress)) {
      logger.warn(`${accountAddress} is unlocked alreadly!`);
      return;
    }
    this.walletByAddress[accountAddress.toLowerCase()] = wallet;
  }
  public unlockAll(passwds: string[]) {
    passwds.forEach(passwd => this.unlock(passwd));
  }

  public has(accountAddress: string) {
    return accountAddress.toLowerCase() in this.walletByAddress;
  }

  public getSigner(accountAddress: string): Wallet {
    if (!this.has(accountAddress)) {
      throw new Error(`please unlock ${accountAddress} first!`);
    }
    return this.walletByAddress[accountAddress.toLowerCase()];
  }
}
