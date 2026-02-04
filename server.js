const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

const MAX_SUPPLY = 100000000;
const BLOCK_REWARD = 1;
let DIFFICULTY = 4;

let chain = [];
let mempool = [];
let balances = {};
let totalSupply = 0;

function sha256(data){
  return crypto.createHash("sha256").update(data).digest("hex");
}

/* ---------- CRYPTO ---------- */

function verifySignature(publicKey, message, signature){
  const verify = crypto.createVerify("SHA256");
  verify.update(message);
  verify.end();
  return verify.verify(publicKey, signature, "hex");
}

/* ---------- BLOCKCHAIN ---------- */

function createGenesisBlock(){
  return {
    index:0,
    prevHash:"0",
    timestamp:Date.now(),
    transactions:[],
    nonce:0,
    hash:sha256("genesis")
  };
}

chain.push(createGenesisBlock());

function getLastBlock(){
  return chain[chain.length-1];
}

function mineBlock(miner){
  if(totalSupply >= MAX_SUPPLY) return null;

  let last = getLastBlock();
  let nonce = 0;
  let timestamp = Date.now();
  let txs = [...mempool];

  // reward
  txs.push({from:"SYSTEM", to:miner, amount:BLOCK_REWARD});

  let hashVal="";
  while(true){
    hashVal = sha256(
      last.hash + timestamp + JSON.stringify(txs) + nonce
    );
    if(hashVal.startsWith("0".repeat(DIFFICULTY))) break;
    nonce++;
  }

  let block = {
    index:chain.length,
    prevHash:last.hash,
    timestamp,
    transactions:txs,
    nonce,
    hash:hashVal
  };

  applyTransactions(txs);
  chain.push(block);
  mempool = [];
  totalSupply += BLOCK_REWARD;

  if(chain.length % 5 === 0) DIFFICULTY++;

  return block;
}

function applyTransactions(txs){
  for(let tx of txs){
    if(!balances[tx.from]) balances[tx.from]=0;
    if(!balances[tx.to]) balances[tx.to]=0;

    if(tx.from !== "SYSTEM"){
      balances[tx.from] -= tx.amount;
    }
    balances[tx.to] += tx.amount;
  }
}

/* ---------- API ---------- */

// create transaction
app.post("/transaction",(req,res)=>{
  const {from,to,amount,signature,publicKey} = req.body;

  if(!from || !to || !amount || !signature || !publicKey){
    return res.json({error:"Invalid transaction data"});
  }

  const message = from + to + amount;

  const valid = verifySignature(publicKey,message,signature);
  if(!valid){
    return res.json({error:"Invalid signature"});
  }

  if((balances[from]||0) < amount){
    return res.json({error:"Insufficient funds"});
  }

  mempool.push({from,to,amount});
  res.json({success:true});
});

// mining
app.post("/mine",(req,res)=>{
  const {miner} = req.body;
  if(!miner) return res.json({error:"Missing miner"});
  const block = mineBlock(miner);
  if(!block) return res.json({error:"Max supply reached"});
  res.json({success:true,block});
});

// chain
app.get("/chain",(req,res)=>{
  res.json(chain);
});

// balance
app.get("/balance/:wallet",(req,res)=>{
  res.json({balance:balances[req.params.wallet]||0});
});

// stats
app.get("/stats",(req,res)=>{
  res.json({
    blocks:chain.length,
    supply:totalSupply,
    difficulty:DIFFICULTY
  });
});

app.listen(PORT,()=>{
  console.log("SofiaCoin REAL blockchain running on port",PORT);
});
