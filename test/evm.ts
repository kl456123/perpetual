import { ethers } from 'hardhat';

export async function mineAvgBlock() {
  await ethers.provider.send('evm_increaseTime', [15]);
  await ethers.provider.send('evm_mine', []);
}
