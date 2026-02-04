const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

const CREATOR_WALLET = "SOFIACOIN_CREATOR";
const MAX_SUPPLY = 100000000;
const BLOCK_REWARD = 1;
let DIFFICULTY = 4;

let chain = [];
let mempool = [];
let balances = {};
let totalSupply = 0;

function hash(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function createGenesisBlock() {
  return {
    index: 0,
    prevHash: "0",
    timestamp: Date.now(),
    transactions: [],
    nonce: 0,
    hash: hash("genesis")
  };
}

chain.push(createGenesisBlock());

function getLastBlock() {
  return chain[chain.length - 1];
}

function mineBlock(miner) {
  if (totalSupply >= MAX_SUPPLY) return null;

  let last = getLastBlock();
  let nonce = 0;
  let timestamp = Date.now();
  let txs = [...mempool];

  let reward = BLOCK_REWARD;
  let creatorFee = reward * 0.01;
  reward -= creatorFee;

  txs.push({
    from: "SYSTEM",
    to: miner,
    amount: reward
  });

  txs.push({
    from: "SYSTEM",
    to: CREATOR_WALLET,
    amount: creatorFee
  });

  let hashVal = "";

  while (true) {
    hashVal = hash(
      last.hash +
      timestamp +
      JSON.stringify(txs) +
      nonce
    );

    if (hashVal.startsWith("0".repeat(DIFFICULTY))) break;

    nonce++;
  }

  let block = {
    index: chain.length,
    prevHash: last.hash,
    timestamp,
    transactions: txs,
    nonce,
    hash: hashVal
  };

  applyTransactions(txs);
  chain.push(block);
  mempool = [];

  totalSupply += BLOCK_REWARD;

  adjustDifficulty();
  return block;
}

function applyTransactions(txs) {
  for (let tx of txs) {
    if (!balances[tx.from]) balances[tx.from] = 0;
    if (!balances[tx.to]) balances[tx.to] = 0;

    if (tx.from !== "SYSTEM") {
      balances[tx.from] -= tx.amount;
    }

    balances[tx.to] += tx.amount;
  }
}

function adjustDifficulty() {
  if (chain.length % 5 === 0) {
    DIFFICULTY++;
  }
}

app.post("/transaction", (req, res) => {
  const { from, to, amount } = req.body;

  if (!from || !to || !amount) {
    return res.json({ error: "Invalid transaction" });
  }

  if ((balances[from] || 0) < amount) {
    return res.json({ error: "Insufficient funds" });
  }

  mempool.push({ from, to, amount });
  res.json({ success: true });
});

app.post("/mine", (req, res) => {
  const { miner } = req.body;

  if (!miner) return res.json({ error: "Missing miner" });

  let block = mineBlock(miner);
  if (!block) return res.json({ error: "Max supply reached" });

  res.json({ success: true, block });
});

app.get("/chain", (req, res) => {
  res.json(chain);
});

app.get("/balance/:wallet", (req, res) => {
  let wallet = req.params.wallet;
  res.json({ balance: balances[wallet] || 0 });
});

app.get("/stats", (req, res) => {
  res.json({
    blocks: chain.length,
    supply: totalSupply,
    difficulty: DIFFICULTY
  });
});

app.listen(PORT, () => {
  console.log("SofiaCoin blockchain running on port " + PORT);
});
