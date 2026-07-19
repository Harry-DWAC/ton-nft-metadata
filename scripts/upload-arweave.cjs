#!/usr/bin/env node
/**
 * TON NFT 素材 + 元数据 Arweave (Irys) 上传脚本
 * 用 龙犀儿 的流程: 上传→获取CID→replace-cid.js
 *
 * 用法:
 *   node scripts/upload-arweave.cjs        # 上传全部素材
 *   node scripts/upload-arweave.cjs check  # 仅检查余额
 *
 * Lessons applied:
 *   龙犀儿: Arweave永久存储
 *   Venessa #2: 上传后验证(不只看API返回)
 */

const Irys = require('@irys/sdk');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const path = require('path');

const IRYS_URL = 'https://node1.irys.xyz';
const PROJECT = path.resolve(__dirname, '..');
const ASSETS = path.join(PROJECT, 'assets');
const METADATA = path.join(PROJECT, 'metadata');

// ETH 钱包私钥 (from 三姐妹钱包.json)
const ETH_PRIVATE_KEY = '4265ca622c1962582706e62ce51688ae1dd8455deb420c4c148d8307432da405';

// 要上传的文件
const FILES = {
  imageAuls: { path: path.join(ASSETS, 'auls-pass-001-hd.png'), tags: { 'Content-Type': 'image/png', 'App-Name': 'TON-Service-Pass' } },
  imageDwac: { path: path.join(ASSETS, 'dwac-pass-001-hd.png'), tags: { 'Content-Type': 'image/png', 'App-Name': 'TON-Service-Pass' } },
  logoDwac:  { path: path.join(ASSETS, 'DWAC Logo.png'),         tags: { 'Content-Type': 'image/png', 'App-Name': 'TON-Service-Pass' } },
  logoAuls:  { path: path.join(ASSETS, 'Law School 校徽.png'),   tags: { 'Content-Type': 'image/png', 'App-Name': 'TON-Service-Pass' } },
};

// 集合元数据
function collectionMetadata(imageCid) {
  return {
    name: 'AULS & DWAC Service Pass NFT',
    description: 'Service Pass NFTs for Atlantis University School of Law (AULS) and Digital World Arbitration Centre (DWAC). Grants access to Agent-Arbitrator training, degree certification, legal consultation, and arbitration services. Burn-to-redeem. Batch 1 on TON.',
    image: `https://arweave.net/${imageCid}`,
    external_url: 'https://dwac.net',
    attributes: [
      { trait_type: 'Blockchain', value: 'TON' },
      { trait_type: 'Standard', value: 'TEP-62' },
      { trait_type: 'Batch', value: '1' },
      { trait_type: 'Total Supply', value: '100' },
    ],
  };
}

async function initIrys() {
  console.log('1️⃣ 初始化 Irys (Ethereum)...');
  
  const irys = new Irys({
    url: IRYS_URL,
    token: 'ethereum',
    key: ETH_PRIVATE_KEY,
    config: { providerUrl: 'https://ethereum-rpc.publicnode.com', timeout: 120000 },
  });

  const addr = irys.address;
  const balance = await irys.getBalance(addr);
  const price = await irys.getPrice(100000);  // ~100KB
  console.log(`   Irys Address: ${addr}`);
  console.log(`   Balance:      ${irys.utils.fromAtomic(balance)} ETH`);
  console.log(`   Price/100KB:  ${irys.utils.fromAtomic(price)} ETH`);

  return irys;
}

async function uploadFile(irys, filePath, tags, label) {
  if (!existsSync(filePath)) {
    console.log(`   ⏭️  ${label}: 文件不存在, 跳过`);
    return null;
  }
  
  const fileSize = readFileSync(filePath).length;
  const filePrice = await irys.getPrice(fileSize);
  console.log(`\n2️⃣  上传 ${label}...`);
  console.log(`    大小: ${(fileSize/1024).toFixed(1)}KB, 费用: ${irys.utils.fromAtomic(filePrice)} ETH`);
  
  // 检查余额
  const balance = await irys.getBalance(irys.address);
  if (balance < filePrice) {
    const needed = filePrice - balance;
    console.log(`    余额不足, 需 ${irys.utils.fromAtomic(needed)} ETH`);
    console.log(`    尝试充值...`);
    try {
      const fundTx = await irys.fund(needed);
      console.log(`    ✅ 充值成功! Tx: ${fundTx}`);
    } catch (e) {
      console.error(`    ❌ 充值失败: ${e.message}`);
      return null;
    }
  }

  // Lesson #2 (Venessa): 上传后实际验证
  const ext = path.extname(filePath).slice(1);
  const contentType = ext === 'png' ? 'image/png' : ext === 'json' ? 'application/json' : 'application/octet-stream';
  const tagsArr = Object.entries(tags || {}).map(([name, value]) => ({ name, value }));
  tagsArr.push({ name: 'Content-Type', value: contentType });
  
  try {
    const receipt = await irys.uploadFile(filePath, { tags: tagsArr });
    const url = `https://arweave.net/${receipt.id}`;
    console.log(`    ✅ 上传成功!`);
    console.log(`       ID:  ${receipt.id}`);
    console.log(`       URL: ${url}`);
    
    // Lesson #2: 验证
    console.log(`     验证中...`);
    try {
      const verifyRes = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
      if (verifyRes.ok) {
        console.log(`       ✅ 可访问 (${verifyRes.status})`);
      } else {
        console.warn(`       ⚠️ 返回 ${verifyRes.status}`);
      }
    } catch (e) {
      console.warn(`       ⚠️ 验证超时, 可能在传播中`);
    }
    
    return receipt.id;
  } catch (e) {
    console.error(`    ❌ 上传失败: ${e.message}`);
    return null;
  }
}

async function main() {
  const checkOnly = process.argv[2] === 'check';
  
  console.log('='.repeat(60));
  console.log('TON NFT → Arweave 上传 (Irys)');
  console.log('='.repeat(60));

  const irys = await initIrys();
  
  if (checkOnly) {
    console.log('\n仅检查模式 - 完成.');
    process.exit(0);
  }

  // 上传图片素材
  const imgIds = {};
  for (const [key, fileInfo] of Object.entries(FILES)) {
    const cid = await uploadFile(irys, fileInfo.path, fileInfo.tags, key);
    if (cid) imgIds[key] = cid;
  }

  if (!imgIds.imageAuls || !imgIds.imageDwac) {
    console.error('\n❌ 图片上传失败, 无法继续');
    process.exit(1);
  }

  // 选择展示用图片 (DWAC Logo 或 auls-pass)
  const displayCid = imgIds.logoDwac || imgIds.imageDwac;

  // 上传集合元数据
  console.log('\n3️⃣ 上传集合元数据...');
  const colMeta = collectionMetadata(displayCid);
  const colMetaJson = JSON.stringify(colMeta, null, 2);
  const colMetaPath = path.join(PROJECT, 'metadata', 'collection.json');
  writeFileSync(colMetaPath, colMetaJson);
  
  const colCid = await uploadFile(irys, colMetaPath, { 'App-Name': 'TON-Service-Pass' }, 'collection-metadata');
  
  // 上传各个NFT元数据
  console.log('\n4️⃣ 上传100个NFT元数据文件...');
  const metaIds = { auls: [], dwac: [] };
  for (const type of ['auls', 'dwac']) {
    for (let i = 1; i <= 50; i++) {
      const fp = path.join(METADATA, `ton-${type}-pass-${String(i).padStart(3,'0')}.json`);
      if (!existsSync(fp)) {
        console.log(`   ⏭️  ${type} #${i}: 文件不存在`);
        continue;
      }
      const cid = await uploadFile(irys, fp, { 'App-Name': 'TON-Service-Pass' }, `${type} #${i}`);
      if (cid) metaIds[type].push(cid);
    }
  }

  // 输出结果
  console.log('\n' + '='.repeat(60));
  console.log('🎉 上传完成!');
  console.log('='.repeat(60));
  console.log(`\n集合元数据 CID:  ${colCid}`);
  console.log(`AULS 图片 CID:   ${imgIds.imageAuls}`);
  console.log(`DWAC 图片 CID:   ${imgIds.imageDwac}`);
  
  console.log(`\n下一步: 替换占位符后部署`);
  console.log(`  node scripts/replace-cid.js ${colCid} ${imgIds.imageAuls} ${imgIds.imageDwac}`);
  console.log(`  node scripts/deploy-ton-nft.js prepare`);
}

main().catch(e => {
  console.error('\n❌ 严重错误:', e.message);
  process.exit(1);
});
