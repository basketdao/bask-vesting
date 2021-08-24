require("dotenv").config(); // eslint-disable-line
import { HardhatUserConfig } from "hardhat/config";
import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn moreww
const config: HardhatUserConfig = {
  solidity: {
    version: "0.7.3",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      timeout: 1200000,
      accounts: [
        process.env["PRIVATE_KEY"]
          ? process.env["PRIVATE_KEY"]
          : "0000000000000000000000000000000000000000000000000000000000000001",
      ],
    },
    remote: {
      url: process.env["REMOTE_URL"]
        ? process.env["REMOTE_URL"]
        : "http://127.0.0.1:8545",
      accounts: [
        process.env["PRIVATE_KEY"]
          ? process.env["PRIVATE_KEY"]
          : "0000000000000000000000000000000000000000000000000000000000000001",
      ],
    },
    hardhat: {
      chainId: 1,
      accounts: {
        mnemonic:
          "myth like bonus scare over problem client lizard pioneer submit female collect",
        accountsBalance: "100000000000000000000000",
      },
      forking: {
        enabled: true,
        url: process.env["RPC_URL"]
          ? process.env["RPC_URL"]
          : "http://127.0.0.1:8545",
      },
      blockGasLimit: 20000000,
      allowUnlimitedContractSize: true,
    },
  },
  mocha: {
    timeout: 1200000,
  },
};

export default config;
