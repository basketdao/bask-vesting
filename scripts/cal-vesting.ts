import { BigNumber, ethers } from "ethers";
import fetch from "node-fetch";
import { providers as MulticallProvider } from "@0xsequence/multicall";

import exemptStacked from "./special-exempt.json";

import masterchefAbi from "./masterchef.json";
import BASK_DEPOSITORS from "./bask-depositors.json";
import path from "path";
import fs from "fs";
import { formatUnits } from "@ethersproject/units";

// Etherscan API KEY
const ETHERSCAN_API_KEY = "AH56YE6FZWX7QHMR6JFV3FGHCNWCXCVKCV";

// Vesting start block =
const VESTING_START_BLOCK = 12346411;
const WEEKLY_DELTA = 6400 * 7;
const VESTING_END_BLOCK = 12771871;

const EXEMPT_BLOCK_START = 12445877;
const EXEMPT_BLOCK_END = 12485848;

const MASTERCHEF = "0xDB9daa0a50B33e4fe9d0ac16a1Df1d335F96595e".toLowerCase();
const MASTERCHEF_PENDING = "0x6141A124a46dc9023F76E4e76a15D3BeA2F2D713".toLowerCase();

const EXEMPT_STACKED = exemptStacked.map((x) => x.toLowerCase());

const WITHDRAW_TOPIC =
  "0xf279e6a1f5e320cca91135676d9cb6e44ca8a08c0b88342bcdb1144f6511b568";
const DEPOSIT_TOPIC =
  "0x90890809c654f11d6e72a28fa60149770a0d11ec6c92319d6ceb2bb0a4ea1a15";

const provider = new ethers.providers.JsonRpcProvider();
const multicallProvider = new MulticallProvider.MulticallProvider(provider);
const masterchefPending = new ethers.Contract(
  MASTERCHEF_PENDING,
  masterchefAbi,
  multicallProvider
);
const masterchef = new ethers.Contract(
  MASTERCHEF,
  masterchefAbi,
  multicallProvider
);

// 1. Get everyone who interacted with Masterchef
// 2. Get: 0, 1, 2 pending rewards on MasterChef
// 3. And however many BASK tokens that has been xfer'ed to them

type Log = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  gasPrice: string;
  gasUsed: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
};

type Address = string;
type Amount = BigNumber;

const getLogs = async (
  fromBlock: number,
  toBlock: number,
  topic: string
): Promise<Log[]> => {
  const url = `https://api.etherscan.io/api?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${MASTERCHEF}&topic0=${topic}&apikey=${ETHERSCAN_API_KEY}`;

  const data = await fetch(url).then((x) => x.json());

  return data.result;
};

const getVestingWeek = async (weekNo: number) => {
  const startBlock = VESTING_START_BLOCK + (weekNo - 1) * WEEKLY_DELTA;
  let endBlock = VESTING_START_BLOCK + weekNo * WEEKLY_DELTA;
  endBlock = endBlock > VESTING_END_BLOCK ? VESTING_END_BLOCK : endBlock;

  const withdrawLogs = await getLogs(startBlock, endBlock, WITHDRAW_TOPIC);
  const depositLogs = await getLogs(startBlock, endBlock, DEPOSIT_TOPIC);
  const logs = [...withdrawLogs, ...depositLogs];

  // Calculate BASK withdrawn (both on deposit and withdraw events)
  const withdrawEvents = await Promise.all(
    logs.map((x) => {
      const user = ethers.utils.defaultAbiCoder
        .decode(["address"], x.topics[1])[0]
        .toLowerCase();
      const pid = ethers.utils.defaultAbiCoder.decode(
        ["uint256"],
        x.topics[2]
      )[0];

      return masterchefPending
        .pendingBasket(pid, user, {
          blockTag: parseInt(x.blockNumber, 16) - 1,
        })
        .catch(() => {
          // console.log("error", user, pid, parseInt(x.blockNumber) - 1);
          return ethers.constants.Zero;
        });
    })
  );

  const withdrawnBask: Record<Address, Amount> = logs
    .map((x, idx) => {
      const user = ethers.utils.defaultAbiCoder
        .decode(["address"], x.topics[1])[0]
        .toLowerCase();

      return {
        user,
        amount: withdrawEvents[idx],
      };
    })
    .reduce((acc, x) => {
      return {
        ...acc,
        [x.user]: (acc[x.user] || ethers.constants.Zero).add(x.amount),
      };
    }, {});

  const pending0Start = await Promise.all(
    BASK_DEPOSITORS.map((x) =>
      masterchefPending.pendingBasket(0, x, { blockTag: startBlock })
    )
  );

  const pending0End = await Promise.all(
    BASK_DEPOSITORS.map((x) =>
      masterchefPending.pendingBasket(0, x, { blockTag: endBlock })
    )
  );

  const pending1Start = await Promise.all(
    BASK_DEPOSITORS.map((x) =>
      masterchefPending.pendingBasket(1, x, { blockTag: startBlock })
    )
  );

  const pending1End = await Promise.all(
    BASK_DEPOSITORS.map((x) =>
      masterchefPending.pendingBasket(1, x, { blockTag: endBlock })
    )
  );

  const pending2Start = await Promise.all(
    BASK_DEPOSITORS.map((x) =>
      masterchefPending.pendingBasket(2, x, { blockTag: startBlock })
    )
  );

  const pending2End = await Promise.all(
    BASK_DEPOSITORS.map((x) =>
      masterchefPending.pendingBasket(2, x, { blockTag: endBlock })
    )
  );

  // Note that the delta should be the withdrawn
  const earnedInPeriod = BASK_DEPOSITORS.map((user, idx) => {
    const userL = user.toLowerCase();

    const gainedInPeriodPending = pending0End[idx]
      .sub(pending0Start[idx])
      .add(pending1End[idx].sub(pending1Start[idx]))
      .add(pending2End[idx].sub(pending2Start[idx]));

    return {
      user: userL,
      amount: gainedInPeriodPending.add(
        withdrawnBask[userL] || ethers.constants.Zero
      ),
    };
  })
    .filter((x) => x.amount.gt(0))
    .reduce((acc, x) => {
      return { ...acc, [x.user.toLowerCase()]: x.amount };
    }, {});

  // Slashing
  const slashed = [
    ...new Set(
      withdrawLogs
        .filter((x) => ethers.BigNumber.from(x.data).gt(0))
        .map(
          (x) =>
            ethers.utils.defaultAbiCoder.decode(["address"], x.topics[1])[0]
        )
    ),
  ].map((x) => x.toLowerCase());

  let slashedFixed = slashed;
  if (EXEMPT_BLOCK_START < startBlock && startBlock < EXEMPT_BLOCK_END) {
    slashedFixed = slashed.filter((x) => !EXEMPT_STACKED.includes(x));
  }
  slashedFixed = slashedFixed.reduce((acc, x) => {
    return { ...acc, [x]: true };
  }, {});

  // How much users earned in this period
  const earnInPeriodAfterSlashing = Object.keys(earnedInPeriod).reduce(
    (acc, x) => {
      return {
        ...acc,
        [x]:
          x in slashedFixed
            ? earnedInPeriod[x].div(2).toString()
            : earnedInPeriod[x].toString(),
      };
    },
    {}
  );

  const toBeDistributed = Object.keys(earnInPeriodAfterSlashing).reduce(
    (acc, x) => {
      return acc.add(earnInPeriodAfterSlashing[x]);
    },
    ethers.constants.Zero
  );

  console.log(
    "BASK to be distributed on week " +
      weekNo.toString() +
      " " +
      formatUnits(toBeDistributed)
  );

  fs.writeFileSync(
    path.resolve(__dirname, "output", `week${weekNo.toString()}.json`),
    JSON.stringify(earnInPeriodAfterSlashing, null, 4)
  );
};

const main = async () => {
  for (let i = 1; i < 11; i++) {
    console.log("week", i);
    await getVestingWeek(i);
  }
};

main();
