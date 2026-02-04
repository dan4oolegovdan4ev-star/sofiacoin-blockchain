const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET","POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

const MAX_SUPPLY = 100000000;
const BLOCK_REWARD = 5;
let DIFFICULTY = 4;

let chain = [];
let mempool = [];
let balances = {};
let totalSupply = 0;
let hashrateStats = {};

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function generateSeed() {
  const words = ["apple","moon","crypto","wolf","forest","sun","river","dragon","stone","king","hero","night","storm","fire","gold"];
  return Array.from({length:12},()=>words[Math.floor(Math.random()*words.length)]).join(" ");
}

function walletFromSeed(seed) {
  return "SFC" + sha256(seed).slice(0,16);
}

function createGenesisBlock() {
  return {index:0, prevHash:"0", timestamp:Date.now(), transactions:[], nonce:0, hash:sha256("genesis")};
}

chain.push(createGenesisBlock());

function applyTransactions(txs) {
  for (let tx of txs) {
    balances[tx.from] = balances[tx.from] || 0;
    balances[tx.to] = balances[tx.to] || 0;
    if (tx.from !== "SYSTEM") balances[tx.from] -= tx.amount;
    balances[tx.to] += tx.amount;
  }
}

function mineBlock(miner) {
  if (totalSupply >= MAX_SUPPLY) return null;

  let last = chain[chain.length - 1];
  let nonce = 0;
  let timestamp = Date.now();
  let txs = [...mempool];

  txs.push({from:"SYSTEM", to: miner, amount: BLOCK_REWARD});

  let start = Date.now();
  let hash = "";

  while(true) {
    hash = sha256(last.hash + timestamp + JSON.stringify(txs) + nonce);
    if (hash.startsWith("0".repeat(DIFFICULTY))) break;
    nonce++;
  }

  let duration = (Date.now() - start) / 1000;
  let hashesPerSec = nonce / duration;
  let mh = (hashesPerSec / 1000000).toFixed(3);

  hashrateStats[miner] = mh;

  let block = {
    index: chain.length,
    prevHash: last.hash,
    timestamp,
    transactions: txs,
    nonce,
    hash
  };

  applyTransactions(txs);
  chain.push(block);
  mempool = [];
  totalSupply += BLOCK_REWARD;

  if(chain.length % 3 === 0) DIFFICULTY++;

  return block;
}

// API ONLY
app.get("/wallet", (req,res)=>{
  const seed = generateSeed();
  const wallet = walletFromSeed(seed);
  balances[wallet] = balances[wallet] || 0;
  res.json({wallet, seed});
});

app.post("/transaction", (req,res)=>{
  const {from,to,amount} = req.body;
  if (!from || !to || !amount) return res.json({error:"Invalid tx"});
  if ((balances[from]||0) < amount) return res.json({error:"Not enough funds"});
  mempool.push({from,to,amount});
  res.json({success:true});
});

app.post("/mine", (req,res)=>{
  const {miner} = req.body;
  const block = mineBlock(miner);
  if (!block) return res.json({error:"Max supply reached"});
  res.json({success:true, block});
});

app.get("/balance/:wallet", (req,res)=>{
  res.json({balance: balances[req.params.wallet] || 0});
});

app.get("/stats", (req,res)=>{
  res.json({
    blocks: chain.length,
    supply: totalSupply,
    difficulty: DIFFICULTY,
    hashrateStats
  });
});

app.listen(PORT, ()=>console.log("SofiaCoin API running on port", PORT));
