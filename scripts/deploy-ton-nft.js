#!/usr/bin/env node
/**
 * TON NFT 部署工具 (tonweb)
 *
 * 用法:
 *   node deploy-ton-nft.js prepare         # 生成Collection部署消息
 *   node deploy-ton-nft.js mint <addr> <start> <n>  # 生成Mint消息
 *   node deploy-ton-nft.js list <addr>     # 查看集合信息
 *   node deploy-ton-nft.js verify <addr> <index>  # 验证某个NFT
 *
 * Lessons:
 *   Venessa #1: 空字节检查
 *   龙犀儿: Arweave永久存储 + 分批铸造 + 铸后验证
 */

const tonweb = require('tonweb');
const fs = require('fs');
const path = require('path');
const { Address, toNano, fromNano, bytesToBase64, base64ToBytes, BN } = tonweb.utils;
const Cell = tonweb.boc.Cell;

const RPC = 'https://toncenter.com/api/v2/jsonRPC';
const API_KEY = '';
const provider = new tonweb.HttpProvider(RPC, { apiKey: API_KEY });

const WALLET = 'UQDb6dm0keTz7-Nhy9ERtbj3YxKblmTj1SzlORL6x4XUwrQI';
const OWNER = 'UQDCW7waS_aHBTsCXrqT76kY6lIsFqQJW_YRlEWGV4Rpp653';
const PROJECT = path.resolve(__dirname, '..');
const METADATA = path.join(PROJECT, 'metadata');

// ─── helpers ──────────────────────────────────────────────────────────

function sanitize(s) { return s && s.includes('\x00') ? (console.warn('⚠️ null byte cleaned'), s.replace(/\x00/g,'')) : s; }

function loadMeta(type, index) {
  const fp = path.join(METADATA, `ton-${type}-pass-${String(index+1).padStart(3,'0')}.json`);
  if (!fs.existsSync(fp)) throw Error(`Missing: ${fp}`);
  const d = JSON.parse(fs.readFileSync(fp,'utf-8'));
  ['name','description','image'].forEach(k => { if(d[k]) d[k]=sanitize(d[k]); });
  return d;
}

// ─── 1. 准备集合部署 ──────────────────────────────────────────────────

async function prepare() {
  console.log('=== NFT Collection 部署准备 ===\n');

  // 集合元数据URI — 上传Arweave后替换
  const colUri = 'https://raw.githubusercontent.com/Harry-DWAC/ton-nft-metadata/main/metadata/collection.json';
  const baseUri = 'https://raw.githubusercontent.com/Harry-DWAC/ton-nft-metadata/main/';

  const NftCollection = tonweb.token.nft.NftCollection;
  const NftItem = tonweb.token.nft.NftItem;
  const collection = new NftCollection(provider, {
    ownerAddress: new Address(OWNER),
    collectionContentUri: colUri,
    nftItemContentBaseUri: baseUri,
    nftItemCodeHex: NftItem.codeHex,
    royalty: 0.05,
    royaltyAddress: new Address(WALLET),
  });

  const address = await collection.getAddress();
  console.log(`  合约地址: ${address.toString(true,true,true)}`);
  console.log(`  所有者:    ${OWNER}`);
  console.log(`  版税:      5%`);
  console.log(`  集合URI:   ${colUri}`);
  console.log(`  基础URI:   ${baseUri}\n`);

  // 构建stateInit (用于MCP send_raw_transaction)
  const { stateInit, address: colAddr } = await collection.createStateInit();
  const initBoc = bytesToBase64(await stateInit.toBoc());

  console.log('────────── MCP 部署消息 ──────────');
  console.log(`发送到: ${colAddr.toString(true,true,true)}`);
  console.log(`金额:   0.05 TON (部署gas)`);
  console.log(`stateInit: 见下方\n`);
  console.log(JSON.stringify({
    address: address.toString(true,true,true),
    amount: '50000000',
    stateInit: initBoc,
    payload: '',  // 空body即可触发部署
  }, null, 2));

  return { address: address.toString(true,true,true), stateInit: initBoc };
}

// ─── 2. 准备铸造 ──────────────────────────────────────────────────────

async function mint(colAddr, start, count) {
  console.log(`=== 铸造 #${start}-${start+count-1} ===\n`);

  const NftCollection = tonweb.token.nft.NftCollection;
  const NftItem = tonweb.token.nft.NftItem;
  const collection = new NftCollection(provider, {
    ownerAddress: new Address(OWNER),
    collectionContentUri: '',
    nftItemContentBaseUri: '',
    nftItemCodeHex: NftItem.codeHex,
    royalty: 0.05,
    royaltyAddress: new Address(WALLET),
  });

  const msgs = [];
  for (let i = start; i < start + count; i++) {
    const type = i < 50 ? 'auls' : 'dwac';
    const localIdx = type === 'auls' ? i : i - 50;
    const meta = loadMeta(type, localIdx);

    const body = collection.createMintBody({
      itemIndex: i,
      amount: toNano('0.02'),      // 0.02 TON转给NFT合约
      itemOwnerAddress: new Address(WALLET),
      itemContentUri: sanitize(meta.image),
    });

    const bodyB64 = bytesToBase64(await body.toBoc());

    msgs.push({
      index: i,
      type,
      name: meta.name,
      address: colAddr,
      amount: toNano('0.05').toString(),  // 0.05 TON每条铸造消息
      payload: bodyB64,
    });
  }

  msgs.forEach(m => console.log(`  [${m.index}] ${m.name}`));

  console.log(`\n────────── MCP 铸造消息 ──────────`);
  console.log(JSON.stringify({
    messages: msgs.map(m => ({
      address: m.address,
      amount: m.amount,
      payload: m.payload,
    })),
  }, null, 2));
}

// ─── 3. 查看集合 ──────────────────────────────────────────────────────

async function list(addr) {
  try {
    const collection = new tonweb.token.nft.NftCollection(provider, {
      ownerAddress: new Address(OWNER),
    });
    const data = await collection.getCollectionData();
    console.log('=== 集合信息 ===');
    console.log(`  地址:     ${addr}`);
    console.log(`  所有者:   ${data.ownerAddress}`);
    console.log(`  已铸造:   ${data.nextItemIndex}`);
    console.log(`  集合URI:  ${data.collectionContentUri}`);

    // 获取版税
    const royalty = await collection.getRoyaltyParams();
    console.log(`  版税率:   ${(royalty.royaltyFactor/royalty.royaltyBase*100).toFixed(1)}%`);
    console.log(`  版税地址: ${royalty.royaltyAddress}`);

    // 前5个NFT
    console.log(`\n  ── 前5个NFT地址 ──`);
    for (let i = 0; i < Math.min(5, data.nextItemIndex); i++) {
      try {
        const itemAddr = await collection.getNftItemAddressByIndex(i);
        console.log(`  #${i}: ${itemAddr}`);
      } catch(e) {
        console.log(`  #${i}: (获取失败)`);
      }
    }
  } catch(e) {
    console.error(`❌ 错误: ${e.message}`);
  }
}

// ─── 4. 验证NFT ──────────────────────────────────────────────────────

async function verify(addr, index) {
  try {
    const collection = new tonweb.token.nft.NftCollection(provider, {
      ownerAddress: new Address(OWNER),
    });
    const itemAddr = await collection.getNftItemAddressByIndex(index);
    console.log(`  NFT #${index} 地址: ${itemAddr}`);

    const item = new tonweb.token.nft.NftItem(provider, { address: itemAddr });
    const data = await item.getData();
    console.log(`  已初始化: ${data.isInitialized}`);
    console.log(`  所有者:   ${data.ownerAddress}`);
    console.log(`  索引:     ${data.itemIndex}`);

    // 获取完整metadata URI
    const fullContent = await collection.getNftItemContent(item);
    console.log(`  内容URI:  ${fullContent.contentUri}`);

    // Lesson #1 (Venessa): 验证URI不含控制字符
    if (fullContent.contentUri && fullContent.contentUri.includes('\x00')) {
      console.warn('  ⚠️ URI含空字节!');
    } else {
      console.log('  ✅ URI无控制字符');
    }
  } catch(e) {
    console.error(`❌ 错误: ${e.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const handlers = {
  prepare: () => prepare(),
  mint: () => mint(process.argv[3], parseInt(process.argv[4]||'0'), parseInt(process.argv[5]||'5')),
  list: () => list(process.argv[3]),
  verify: () => verify(process.argv[3], parseInt(process.argv[4]||'0')),
};
if (handlers[cmd]) handlers[cmd]().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
else {
  console.log(`用法:\n  node deploy-ton-nft.js prepare\n  node deploy-ton-nft.js mint <addr> <start> <n>\n  node deploy-ton-nft.js list <addr>\n  node deploy-ton-nft.js verify <addr> <index>`);
}
