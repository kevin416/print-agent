# 🔐 SSH访问快速参考

## 📍 服务器信息
- **服务器地址**: `kevin@90.195.120.165`
- **SSH端口**: `22` (默认)

---

## ⚡ 快速添加新电脑访问

### 方法1: 使用脚本（推荐）
```bash
./add-ssh-key-to-server.sh
```

### 方法2: 使用 ssh-copy-id
```bash
ssh-copy-id kevin@90.195.120.165
```

### 方法3: 手动添加
```bash
# 1. 查看本地公钥
cat ~/.ssh/id_ed25519.pub

# 2. 复制公钥内容，然后连接到服务器添加
ssh kevin@90.195.120.165
mkdir -p ~/.ssh
echo "你的公钥内容" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

---

## 🔑 生成SSH密钥

```bash
# 生成 ed25519 密钥（推荐）
ssh-keygen -t ed25519 -C "your-email@example.com"

# 或生成 RSA 密钥
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
```

---

## 🧪 测试连接

```bash
# 测试SSH连接
ssh kevin@90.195.120.165

# 测试密钥认证（不输入密码）
ssh -o BatchMode=yes kevin@90.195.120.165 "echo '连接成功'"
```

---

## 🛠️ 管理密钥

```bash
# 运行管理脚本
./manage-ssh-keys.sh

# 查看服务器上的授权密钥
ssh kevin@90.195.120.165 "cat ~/.ssh/authorized_keys"

# 检查文件权限
ssh kevin@90.195.120.165 "ls -la ~/.ssh/"
```

---

## ⚙️ 配置SSH别名

编辑 `~/.ssh/config`：
```
Host server-kevin
    HostName 90.195.120.165
    User kevin
    IdentityFile ~/.ssh/id_ed25519
```

然后使用：
```bash
ssh server-kevin
```

---

## 🔒 文件权限检查

正确的权限：
- `.ssh` 目录: `700` (drwx------)
- `authorized_keys`: `600` (-rw-------)

修复权限：
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

---

## 🐛 常见问题

### 仍然需要输入密码
```bash
# 检查权限
ssh kevin@90.195.120.165 "ls -la ~/.ssh/"

# 修复权限
ssh kevin@90.195.120.165 "chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

### 连接被拒绝
```bash
# 检查SSH服务
ssh kevin@90.195.120.165 "sudo systemctl status sshd"

# 检查防火墙
ssh kevin@90.195.120.165 "sudo ufw status"
```

### 查看详细日志
```bash
ssh -v kevin@90.195.120.165
```

---

## 📚 相关文件

- **详细指南**: `SSH_ACCESS_SETUP.md`
- **添加密钥脚本**: `add-ssh-key-to-server.sh`
- **管理密钥脚本**: `manage-ssh-keys.sh`

---

## 💡 提示

- 每台电脑应该使用独立的SSH密钥
- 定期备份 `authorized_keys` 文件
- 可以为公钥添加注释来标识电脑：`ssh-ed25519 AAAAC3... computer-name`

