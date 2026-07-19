#!/usr/bin/env python3
"""
TON NFT 批量元数据生成器
适配 TEP-64 (NFT Metadata) 标准
沿用了 龙犀儿(Solana) 的模板架构 + Venessa(Base) 的校验逻辑

用法:
  python3 generate-metadata.py auls 50       # AULS 50枚
  python3 generate-metadata.py dwac 50       # DWAC 50枚
  python3 generate-metadata.py both          # 各50枚，共100枚

输出: metadata/ton-<type>-<NNN>.json

Lessons applied:
  [Venessa] #1 无色字节问题 → 自动 sanitize
  [Venessa] #3 占位符残留 → 单模板+校验
  [龙犀儿] 统一模板架构
"""
import json, os, sys, re, hashlib

# ─── 配置 ─────────────────────────────────────────────────────────────────────
# TON 钱包地址 (Agentic sub-wallet)
WALLET = "UQDb6dm0keTz7-Nhy9ERtbj3YxKblmTj1SzlORL6x4XUwrQI"

# Arweave 图片 CID 占位符 (上传后替换)
IMAGE_PLACEHOLDER_AULS = "ARWEAVE_AULS_CID_PLACEHOLDER"
IMAGE_PLACEHOLDER_DWAC = "ARWEAVE_DWAC_CID_PLACEHOLDER"

EXTERNAL_URLS = {
    "auls": "https://atlantis-law.vercel.app",
    "dwac": "https://dwac.net",
}

TEMPLATES = {
    "auls": {
        "name_prefix": "AULS Service Pass",
        "description": (
            "Atlantis University School of Law Service Pass NFT. "
            "Grants access to full Agent-Arbitrator training program, "
            "degree certification, and DWAC recommendation letter. "
            "Burn-to-redeem. Batch 1 of 100."
        ),
        "image_placeholder": IMAGE_PLACEHOLDER_AULS,
        "image_file": "auls-pass-001-hd.png",
    },
    "dwac": {
        "name_prefix": "DWAC Service Pass",
        "description": (
            "Digital World Arbitration Centre Service Pass NFT. "
            "Grants 1 professional digital legal consultation (≤60min) "
            "and 1 arbitration service (no limit on dispute value, "
            "172-country enforceable). Burn-to-redeem. Batch 1 of 100."
        ),
        "image_placeholder": IMAGE_PLACEHOLDER_DWAC,
        "image_file": "dwac-pass-001-hd.png",
    },
}

# 检查模板残留
TEMPLATE_PATTERNS = re.compile(r'\{[^}]*\}|__[A-Z]+__|#{.*?}|___ID___|i:03d|%[ds]')

# 占位符标记 (允许存在)
ALLOWED_PLACEHOLDERS = {"ARWEAVE_AULS_CID_PLACEHOLDER", "ARWEAVE_DWAC_CID_PLACEHOLDER"}


def sanitize_string(s: str) -> str:
    """Lesson #1 (Venessa): 去除控制字符和空字节"""
    # 移除空字节和常见控制字符 (保留换行)
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)
    if cleaned != s:
        diff = len(s) - len(cleaned)
        print(f"  ⚠️  已移除 {diff} 个控制字符")
    return cleaned


def generate_batch(nft_type, count, output_dir="metadata"):
    """生成批量元数据"""
    os.makedirs(output_dir, exist_ok=True)

    tmpl = TEMPLATES[nft_type]
    ext_url = EXTERNAL_URLS[nft_type]
    image_ph = tmpl["image_placeholder"]

    for i in range(1, count + 1):
        # TEP-64 标准元数据格式
        metadata = {
            "name": f"{tmpl['name_prefix']} #{i:03d}",
            "description": tmpl['description'],
            "image": f"https://arweave.net/{image_ph}_{nft_type.upper()}_{i:03d}",
            "content_url": None,
            "content_type": None,
            "external_url": ext_url,
            "attributes": [
                {"trait_type": "Type", "value": nft_type.upper()},
                {"trait_type": "Blockchain", "value": "TON"},
                {"trait_type": "Standard", "value": "TEP-62"},
                {"trait_type": "Batch", "value": "1"},
                {"trait_type": "Edition", "value": f"{i}/{count}"},
                {"trait_type": "Price", "value": "1 TON"},
                {"trait_type": "Redeem", "value": "Burn-to-redeem"},
                {"trait_type": "Network", "value": "TON Mainnet"},
            ],
        }

        # Lesson #1: 清理所有字符串字段
        for key in ["name", "description", "image", "external_url"]:
            if isinstance(metadata.get(key), str):
                metadata[key] = sanitize_string(metadata[key])

        filename = f"ton-{nft_type}-pass-{i:03d}.json"
        filepath = os.path.join(output_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"✅ 生成 {count} 个元数据文件 ({nft_type.upper()}) → {output_dir}/")
    return count


def validate_metadata_dir(output_dir="metadata"):
    """Lesson #3 (Venessa): 批量校验元数据，检查占位符残留"""
    import glob
    files = sorted(glob.glob(os.path.join(output_dir, "*.json")))
    issues = 0
    clean_files = 0

    for fp in files:
        with open(fp) as f:
            raw = f.read()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as e:
                print(f"  ❌ {os.path.basename(fp)}: JSON解析错误 {e}")
                issues += 1
                continue

        file_issues = []

        # 检查必要字段
        for field in ["name", "description", "image"]:
            if field not in data:
                file_issues.append(f"缺少 {field}")

        # Lesson #1: 检查空字节
        for field in ["name", "description", "image"]:
            val = data.get(field, "")
            if '\x00' in val:
                file_issues.append(f"⚠️ {field} 含空字节!")

        # Lesson #3: 检查模板残留 (允许占位符)
        def walk(obj, path=""):
            nonlocal file_issues
            if isinstance(obj, dict):
                for k, v in obj.items():
                    walk(v, f"{path}.{k}")
            elif isinstance(obj, list):
                for i, v in enumerate(obj):
                    walk(v, f"{path}[{i}]")
            elif isinstance(obj, str):
                matches = TEMPLATE_PATTERNS.findall(obj)
                for m in matches:
                    if m not in ALLOWED_PLACEHOLDERS:
                        file_issues.append(f"模板残留 in {path}: '{m}'")

        walk(data)

        if not file_issues:
            clean_files += 1
            status = "✅"
        else:
            status = "⚠️"

        print(f"  {status} {os.path.basename(fp)}")
        for issue in file_issues:
            print(f"       {issue}")
            issues += 1

    print(f"\n📊 校验结果: 共 {len(files)} 个文件, 干净 {clean_files}, 问题 {issues}")
    return issues == 0


def generate_arweave_batch_script(nft_type, count, script_path="scripts/upload-arweave.cjs"):
    """生成 Arweave 上传脚本 (仿 龙犀儿)"""
    nft_upper = nft_type.upper()
    image_name = TEMPLATES[nft_type]["image_file"]
    lines = f"""// 自动生成 — TON NFT Arweave 上传脚本
// 用法: node upload-arweave.cjs

const Irys = require('@irys/sdk');
const {{ readFileSync, writeFileSync }} = require('fs');
const path = require('path');

const NFT_TYPE = '{nft_upper}';
const COUNT = {count};
const IMAGE_FILE = '{image_name}';
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const METADATA_DIR = path.join(__dirname, '..', 'metadata');

// ... (完整脚本稍后生成)
"""
    return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法:")
        print("  python3 generate-metadata.py auls <数量>")
        print("  python3 generate-metadata.py dwac <数量>")
        print("  python3 generate-metadata.py both")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "both":
        total = 0
        total += generate_batch("auls", 50)
        total += generate_batch("dwac", 50)
        print(f"\n🎯 总计: {total} 个元数据文件")
    else:
        count = int(sys.argv[2]) if len(sys.argv) >= 3 else 20
        generate_batch(cmd, count)

    # 自动校验
    print("\n── 校验 ──")
    validate_metadata_dir()
