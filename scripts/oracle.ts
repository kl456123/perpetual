import axios from 'axios';
import { logger } from '../src/logger';

const baseUrl = `http://localhost:3000`;
async function request(route) {
  const url = `${baseUrl}${route}`;
  const res = await axios.get(url);
  const quoteRes = res.data;
  logger.info(quoteRes);
  return quoteRes;
}

async function main() {
  await request('/orderbook/v1/fundingRate');
  await request('/account/v1/0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  await request('/orderbook/v1/markets');
}

main().catch(err => logger.error(err.stack));
