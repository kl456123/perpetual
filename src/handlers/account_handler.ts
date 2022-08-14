import { Context } from 'koa';
import { AccountService } from '../services/account_service';

export class AccountHandler {
  constructor(private readonly accountService: AccountService) {}

  public async getAccountBalance(ctx: Context) {
    const account = ctx.params.address;

    const apiAccount = await this.accountService.getAccountBalanceAsync(
      account
    );
    ctx.status = 200;
    ctx.body = apiAccount;
  }
}
