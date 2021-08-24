
import { ethers } from "hardhat";

import merkleData from './merkle-data/week2.json'

const GOVERNANCE = "0x2bF3cC8Fa6F067cc1741c7467C8Ee9F00e837757";
const BASK_TOKEN = "0x44564d0bd94343f72E3C8a0D22308B7Fa71DB0Bb";
const MERKLE_ROOT = merkleData.merkleRoot

const main = async () => {
  const Factory = await ethers.getContractFactory(
    "MerkleDistributorWithRecover"
  );
  const deployed = await Factory.deploy(GOVERNANCE, BASK_TOKEN, MERKLE_ROOT);

  console.log("deployed to", deployed.address);
};

main();