# Launchpad 自动更新（tauri-plugin-updater）接入说明

本项目已通过 `tauri-plugin-updater` 接入自动更新能力。构建时会额外产出
`.sig` 签名文件与 `latest.json` 更新清单，应用内可调用 `check_for_update` /
`install_update` 两个 Rust 命令完成「检测 → 下载 → 安装 → 重启」。

> 注意：下面所有 `<...>` 都是占位符，发布前必须替换成真实值。

## 一、待替换的占位符

| 占位符 | 含义 | 替换位置 |
| --- | --- | --- |
| `<OWNER>` | GitHub 仓库所有者（用户名/组织名） | `src-tauri/tauri.conf.json` 的 `plugins.updater.endpoints` |
| `<REPO>` | GitHub 仓库名 | 同上 |
| `<TAURI_UPDATER_PUBLIC_KEY>` | 更新签名公钥 | `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` |

例如你的仓库是 `octocat/launchpad`，则 endpoints 应为：
`https://github.com/octocat/launchpad/releases/latest/download/latest.json`

## 二、生成签名密钥（仅执行一次）

在本地（需要已安装 `@tauri-apps/cli` 或 `cargo-tauri`）执行：

```bash
npx tauri signer generate -w
```

命令会输出两把密钥：

- **Private key（私钥）**：保存为 CI Secret，变量名 `TAURI_SIGNING_PRIVATE_KEY`。
  - 若生成时设置了密码，还需把密码保存为 CI Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
  - **私钥绝不入库**，不要写进任何文件/配置/日志，只放本机环境变量或 CI Secret。
- **Public key（公钥）**：复制后填入上面 `tauri.conf.json` 的 `pubkey` 字段，
  替换 `<TAURI_UPDATER_PUBLIC_KEY>`。

## 三、版本号同步（每次发版必做）

`tauri.conf.json` 的 `version` 与 `package.json` 的 `version` **必须一致**，
且每次发版递增，否则更新检测会错乱（永远提示已是最新或版本比较错误）。

## 四、打 tag 触发 CI 自动发布

本仓库已加入 GitHub Actions（`.github/workflows/release.yml`），监听 `v*` 形式的 tag：

```bash
git tag v0.1.1
git push origin v0.1.1
```

CI 会：安装依赖 → 构建前端 → `tauri build` → 用私钥签名 →
自动创建 GitHub Release 并上传 `Setup.exe`、`.sig`、`latest.json`（release 默认是草稿，
需到 GitHub 手动发布）。

## 五、本地构建产物说明

执行 `npm run release`（即 `tauri build`）后，在
`src-tauri/target/release/` 下会产出：

- `Launchpad_x.x.x_x64-setup.exe`（nsis 安装包）
- `Launchpad_x.x.x_x64-setup.exe.sig`（签名文件）
- `latest.json`（更新清单）

手动发布时，把这三个文件连同安装包一并上传到 GitHub Release 即可。

## 六、安全提醒

- 私钥 `TAURI_SIGNING_PRIVATE_KEY` **绝不入库**。
- updater 签名（`.sig`）与 Windows 代码签名（authenticode）是两套独立机制；
  本流程只覆盖前者。要去掉 SmartScreen 拦截还需另做 Windows 代码签名。
- endpoint 的 `<OWNER>` / `<REPO>` / 公钥必须与你的真实仓库和密钥一致，
  否则应用会因签名校验失败而拒绝更新。
