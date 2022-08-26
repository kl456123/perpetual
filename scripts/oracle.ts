import axios from 'axios';
import { logger } from '../src/logger';

const baseUrl = `http://localhost:3000`;
async function request(route, query: Record<string, string> = {}) {
  const url = `${baseUrl}${route}`;
  const res = await axios.get(url, { params: query });
  const quoteRes = res.data;
  logger.info(quoteRes);
  return quoteRes;
}

async function main() {
  await request('/orderbook/v1/fundingRate');
  await request('/account/v1/0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  await request('/orderbook/v1/markets');
  await request('/orderbook/v1/order', {
    maker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  });

  const amount = '1000000';
  const account = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  await axios.post(`${baseUrl}/account/v1/drop`, { amount, account });
}

main().catch(err => logger.error(err.stack));
