const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // serve files from root

const PORT = process.env.PORT || 3000;

const MAX_SUPPLY = 100000000;
const BLOCK_REWARD = 25;
const CREATOR_WALLET = "SFC_CREATOR";
let DIFFICULTY = 4;
const TARGET_BLOCK_TIME = 15;

let chain = [];
let mempool = [];
let balances = {};
let totalSupply = 0;
let miningStats = {};
let mined24h = {};

function sha256(data){
  return crypto.createHash("sha256").update(data).digest("hex");
}

function generateSeed(){
  const words = ["apple","banana","cherry","dragon","eagle","forest","gold","hero","island","joker","king","lemon","moon","night","ocean","pearl","queen","rose","sun","tiger","umbrella","violet","wolf","xenon","yellow","zebra"];
  let seed = [];
  for(let i=0;i<12;i++) seed.push(words[Math.floor(Math.random()*words.length)]);
  return seed.join(" ");
}

function walletFromSeed(seed){
  return "SFC"+sha256(seed).slice(0,16);
}

function createGenesisBlock(){
  return {index:0, prevHash:"0", timestamp:Date.now(), transactions:[], nonce:0, hash:sha256("genesis")};
}
chain.push(createGenesisBlock());
balances[CREATOR_WALLET]=0;

function applyTransactions(txs){
  for(let tx of txs){
    if(!balances[tx.from]) balances[tx.from]=0;
    if(!balances[tx.to]) balances[tx.to]=0;
    if(tx.from!=="SYSTEM") balances[tx.from]-=tx.amount;
    balances[tx.to]+=tx.amount;
  }
}

function mineBlock(miner){
  if(totalSupply>=MAX_SUPPLY) return null;
  let last = chain[chain.length-1];
  let nonce = 0;
  let timestamp = Date.now();
  let txs = [...mempool];

  const creatorCut = BLOCK_REWARD*0.01;
  const minerReward = BLOCK_REWARD-creatorCut;

  txs.push({from:"SYSTEM", to:miner, amount:minerReward});
  txs.push({from:"SYSTEM", to:CREATOR_WALLET, amount:creatorCut});

  let start=Date.now();
  let hashVal="";
  while(true){
    hashVal=sha256(last.hash+timestamp+JSON.stringify(txs)+nonce);
    if(hashVal.startsWith("0".repeat(DIFFICULTY))) break;
    nonce++;
  }
  let end=Date.now();

  let mh = Math.floor((nonce/1000)/((end-start)/1000));
  miningStats[miner]=mh;
  mined24h[miner]=(mined24h[miner]||0)+minerReward;

  let block={index:chain.length, prevHash:last.hash, timestamp, transactions:txs, nonce, hash:hashVal};
  applyTransactions(txs);
  chain.push(block);
  mempool=[];
  totalSupply+=BLOCK_REWARD;

  const timeDiff=(Date.now()-last.timestamp)/1000;
  if(timeDiff<TARGET_BLOCK_TIME) DIFFICULTY++;
  else if(timeDiff>TARGET_BLOCK_TIME) DIFFICULTY--;
  if(DIFFICULTY<1) DIFFICULTY=1;
  if(DIFFICULTY>6) DIFFICULTY=6;

  return block;
}

// API
app.get("/wallet",(req,res)=>{
  const seed=generateSeed();
  const wallet=walletFromSeed(seed);
  balances[wallet]=balances[wallet]||0;
  res.json({wallet, seed});
});

app.post("/transaction",(req,res)=>{
  const {from,to,amount}=req.body;
  if(!from||!to||!amount) return res.json({error:"Invalid data"});
  if((balances[from]||0)<amount) return res.json({error:"Insufficient funds"});
  if(amount<=0) return res.json({error:"Invalid amount"});
  mempool.push({from,to,amount});
  res.json({success:true});
});

app.post("/mine",(req,res)=>{
  const {miner}=req.body;
  if(!miner) return res.json({error:"Missing miner"});
  const block=mineBlock(miner);
  if(!block) return res.json({error:"Max supply reached"});
  res.json({success:true,block});
});

app.get("/chain",(req,res)=>res.json(chain));
app.get("/balance/:wallet",(req,res)=>res.json({balance:balances[req.params.wallet]||0}));
app.get("/stats",(req,res)=>res.json({blocks:chain.length,supply:totalSupply,difficulty:DIFFICULTY,miningStats,mined24h}));

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));

app.listen(PORT,()=>console.log("SofiaCoin backend running on port",PORT));
