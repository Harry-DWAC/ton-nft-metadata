# TON NFT 发行项目

## 项目概述

在 TON 链上发行 **AULS Service Pass** 和 **DWAC Service Pass** NFT，用途与 Base 链（Venessa）和 Solana 链（龙犀儿）版本完全一致：

| 系列 | 发行量 | 价格 | 权益 |
|------|--------|------|------|
| AULS Service Pass | 50枚 | 1 TON | 法学院入学→培训→学位→推荐信 |
| DWAC Service Pass | 50枚 | 1 TON | 1次咨询+1次仲裁, 172国可执行 |
| **合计** | **100枚** | — | Burn-to-redeem, Batch 1 |

## 经验教训应用清单

### 来自 Venessa (Base链)
- [x] **#1 空字节** — 元数据生成脚本自动 sanitize 所有字符串
- [x] **#2 IPFS验证** — 改用 Arweave (永久存储, 不用管 pinning)
- [x] **#3 模板残留** — 单模板 + 生成后批量校验 (100/100 全绿)
- [x] **#4 URI可更新** — TON NFT Item 标准支持 `change_content` 消息

### 来自 龙犀儿 (Solana链)
- [x] Arweave/Irys 永久存储
- [x] 分批铸造 (避免一次性gas压力)
- [x] 铸造后遍历验证 URI

## 目录结构

```
TON-NFT/
├── assets/              # 图片素材
│   ├── auls-pass-001-hd.png
│   ├── dwac-pass-001-hd.png
│   ├── DWAC Logo.png
│   └── Law School 校徽.png
├── metadata/            # 元数据 (生成后校验通过)
│   ├── ton-auls-pass-001.json ~ 050.json
│   └── ton-dwac-pass-001.json ~ 050.json
├── scripts/
│   ├── generate-metadata.py   # 元数据生成器
│   ├── deploy-ton-nft.js      # TON NFT 部署主工具
│   ├── replace-cid.js         # CID 替换工具
│   └── test-ton.cjs           # 测试脚本
├── docs/                # 文档
├── contracts/           # 合约 (备用)
└── package.json
```

## 部署流程

### 第一步: 上传素材到 Arweave
```
node scripts/upload-arweave.cjs
```
上传后获得:
- `COLLECTION_CID` — 集合元数据
- `AULS_IMG_CID` — AULS 图片
- `DWAC_IMG_CID` — DWAC 图片

### 第二步: 替换 CID 占位符
```
node scripts/replace-cid.js <col_cid> <auls_cid> <dwac_cid>
```

### 第三步: 部署 Collection 合约
```
node scripts/deploy-ton-nft.js prepare
# → 用输出的MCP消息通过 send_raw_transaction 部署
```

### 第四步: 铸造 NFT
```
node scripts/deploy-ton-nft.js mint <collection_addr> 0 5
node scripts/deploy-ton-nft.js mint <collection_addr> 5 5
# ... 直到 100
```

### 第五步: 验证
```
node scripts/deploy-ton-nft.js list <collection_addr>
node scripts/deploy-ton-nft.js verify <collection_addr> 0
node scripts/deploy-ton-nft.js verify <collection_addr> 1
```

### 第六步: 上架 Getgems
通过 Getgems.io 连接钱包，选择集合，设置 1 TON 起拍价

## 钱包信息

- **TON Agentic Wallet**: `UQDb6dm0keTz7-Nhy9ERtbj3YxKblmTj1SzlORL6x4XUwrQI`
- **Owner**: `UQDCW7waS_aHBTsCXrqT76kY6lIsFqQJW_YRlEWGV4Rpp653`
- **余额**: ~1.68 GRAM (需要约 5+ GRAM 用于全部部署)
- **集合合约地址(预计)**: `EQAQYfj7nMWH8diemlcVmsdBAxPZSIUrEtGQusO-CF0y37tn`

## 预算

| 项目 | 费用 |
|------|------|
| Collection 部署 | ~0.05 TON |
| 铸造 Gas (100枚 × 0.02 TON) | ~2.0 TON |
| 铸造消息费用 (100枚 × 0.05 TON) | ~5.0 TON |
| Arweave 存储 (Irys) | ~0.001 ETH/SOL |
| Getgems 上架 | 免费 |
| **总计** | **~5-7 TON + 存储费** |

当前余额 1.68 GRAM 不足全额铸造。建议策略:
1. 先铸造 20-30 枚验证流程
2. 补充 GRAM 后再铸造剩余
