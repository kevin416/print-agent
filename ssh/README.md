# 🔐 SSH访问管理工具

这个文件夹包含了管理SSH访问服务器 `kevin@90.195.120.165` 的所有工具和文档。

## 📁 文件说明

### 文档
- **`SSH_ACCESS_SETUP.md`** - 完整的SSH访问设置指南，包含详细步骤和故障排查
- **`SSH_QUICK_REFERENCE.md`** - 快速参考卡片，包含常用命令

### 脚本
- **`add-ssh-key-to-server.sh`** - 自动化脚本，用于将新电脑的SSH公钥添加到服务器
- **`manage-ssh-keys.sh`** - 管理脚本，用于查看、添加、删除服务器上的SSH授权密钥

## 🚀 快速开始

### 添加新电脑访问权限

```bash
cd ssh
./add-ssh-key-to-server.sh
```

### 管理SSH密钥

```bash
cd ssh
./manage-ssh-keys.sh
```

## 📚 详细文档

查看 `SSH_ACCESS_SETUP.md` 获取完整的使用指南和故障排查说明。

## 🔒 服务器信息

- **服务器地址**: `kevin@90.195.120.165`
- **SSH端口**: `22` (默认)

## 💡 使用提示

1. 每台电脑应该使用独立的SSH密钥
2. 定期备份 `authorized_keys` 文件
3. 可以使用管理脚本查看所有已授权的密钥
4. 建议为公钥添加注释来标识电脑名称

