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
  await request('/account/v1/0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65');
  await request('/orderbook/v1/markets');
}

main().catch(err => logger.error(err.stack));
