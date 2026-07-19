#!/usr/bin/env node
/**
 * 替换元数据中的Arweave CID占位符
 * 
 * 用法:
 *   node scripts/replace-cid.js <collection_cid> <auls_img_cid> <dwac_img_cid>
 * 
 * 在Arweave上传成功后运行, 完成:
 *   1. collection元数据JSON中的CID
 *   2. 所有AULS元数据中的CID
 *   3. 所有DWAC元数据中的CID
 *   4. 部署脚本中的CID
 * 
 * 用 龙犀儿 的Arweave流程: 上传→获取CID→批量替换
 */

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');
const METADATA_DIR = path.join(PROJECT, 'metadata');
const DEPLOY_SCRIPT = path.join(PROJECT, 'scripts', 'deploy-ton-nft.js');

function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('用法: node replace-cid.js <col_cid> <auls_img_cid> <dwac_img_cid>');
    console.log('示例: node replace-cid.js ABC123 XYZ789 DEF456');
    process.exit(1);
  }

  const [colCid, aulsCid, dwacCid] = args;
  let replaced = 0;

  // 1. 替换AULS元数据
  for (let i = 1; i <= 50; i++) {
    const fp = path.join(METADATA_DIR, `ton-auls-pass-${String(i).padStart(3,'0')}.json`);
    if (!fs.existsSync(fp)) continue;
    let data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const oldImage = data.image;
    data.image = data.image.replace(/ARWEAVE_AULS_CID_PLACEHOLDER_AULS_\d+/g, 
      `${aulsCid}_AULS_${String(i).padStart(3,'0')}`);
    // Lesson #1 (Venessa): 无空字节
    if (data.image.includes('\x00')) throw new Error(`空字节! ${fp}`);
    fs.writeFileSync(fp, JSON.stringify(data, null, 2));
    if (oldImage !== data.image) replaced++;
  }
  console.log(`✅ AULS: ${replaced} 个文件CID已替换`);

  // 2. 替换DWAC元数据
  replaced = 0;
  for (let i = 1; i <= 50; i++) {
    const fp = path.join(METADATA_DIR, `ton-dwac-pass-${String(i).padStart(3,'0')}.json`);
    if (!fs.existsSync(fp)) continue;
    let data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const oldImage = data.image;
    data.image = data.image.replace(/ARWEAVE_DWAC_CID_PLACEHOLDER_DWAC_\d+/g,
      `${dwacCid}_DWAC_${String(i).padStart(3,'0')}`);
    if (data.image.includes('\x00')) throw new Error(`空字节! ${fp}`);
    fs.writeFileSync(fp, JSON.stringify(data, null, 2));
    if (oldImage !== data.image) replaced++;
  }
  console.log(`✅ DWAC: ${replaced} 个文件CID已替换`);

  // 3. 替换部署脚本中的集合CID
  let deployJs = fs.readFileSync(DEPLOY_SCRIPT, 'utf-8');
  deployJs = deployJs.replace(/COLLECTION_CID_PLACEHOLDER/g, colCid);
  fs.writeFileSync(DEPLOY_SCRIPT, deployJs);
  console.log(`✅ 部署脚本CID已更新: ${colCid}`);

  console.log(`\n🎉 全部完成! 现在可以运行: node scripts/deploy-ton-nft.js prepare`);
}

main();
