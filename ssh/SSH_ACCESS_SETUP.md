# 🔐 SSH访问设置指南 - 多台电脑访问同一服务器

## 📋 概述

如果你想让另一台电脑也能通过SSH访问服务器 `kevin@90.195.120.165`，需要将新电脑的SSH公钥添加到服务器的授权列表中。

## ⚡ 快速开始（使用脚本）

### 最简单的方法：使用自动化脚本

**在新电脑上运行**：

```bash
# 1. 确保有SSH密钥（如果没有，脚本会提示生成）
# 2. 运行脚本
cd /Users/kevin/Documents/Projects/ssh
./add-ssh-key-to-server.sh
```

脚本会自动：
- 检测本地SSH公钥
- 将公钥添加到服务器
- 测试连接是否成功

---

## 🚀 方法一：从新电脑操作（推荐）

### 步骤1: 在新电脑上生成SSH密钥对

如果新电脑还没有SSH密钥，先生成一个：

```bash
# 生成SSH密钥对（如果还没有）
ssh-keygen -t ed25519 -C "your-email@example.com"

# 或者使用RSA（如果系统不支持ed25519）
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
```

按提示操作：
- 保存路径：直接按回车使用默认路径 `~/.ssh/id_ed25519` 或 `~/.ssh/id_rsa`
- 设置密码：可选，建议设置密码保护私钥

### 步骤2: 将公钥复制到服务器

使用 `ssh-copy-id` 命令（最简单的方法）：

```bash
# 将新电脑的公钥复制到服务器
ssh-copy-id kevin@90.195.120.165
```

系统会提示输入服务器密码，输入后会自动将公钥添加到服务器的 `~/.ssh/authorized_keys` 文件中。

### 步骤3: 测试连接

```bash
# 测试SSH连接（应该不需要输入密码）
ssh kevin@90.195.120.165
```

---

## 🔧 方法二：手动添加公钥

如果 `ssh-copy-id` 不可用，可以手动操作：

### 步骤1: 在新电脑上查看公钥内容

```bash
# 查看公钥内容
cat ~/.ssh/id_ed25519.pub
# 或
cat ~/.ssh/id_rsa.pub
```

复制输出的公钥内容（应该是一行，以 `ssh-ed25519` 或 `ssh-rsa` 开头）。

### 步骤2: 在服务器上添加公钥

从**当前可以访问服务器的电脑**（或直接在服务器上）执行：

```bash
# 连接到服务器
ssh kevin@90.195.120.165

# 在服务器上执行以下命令
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 将新电脑的公钥添加到授权文件
echo "新电脑的公钥内容" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**或者**，从本地电脑直接执行：

```bash
# 从本地电脑执行（需要输入服务器密码）
ssh kevin@90.195.120.165 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '新电脑的公钥内容' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### 步骤3: 测试连接

从新电脑测试：

```bash
ssh kevin@90.195.120.165
```

---

## 📝 方法三：使用现有的授权密钥文件

如果你已经在服务器上有 `authorized_keys` 文件，可以直接复制整个文件：

### 步骤1: 从服务器导出授权密钥

```bash
# 从可以访问的电脑执行
ssh kevin@90.195.120.165 "cat ~/.ssh/authorized_keys" > authorized_keys_backup.txt
```

### 步骤2: 在新电脑上添加自己的公钥

```bash
# 在新电脑上
cat ~/.ssh/id_ed25519.pub >> authorized_keys_backup.txt
```

### 步骤3: 将更新后的文件上传回服务器

```bash
# 从新电脑执行（需要输入密码）
scp authorized_keys_backup.txt kevin@90.195.120.165:~/.ssh/authorized_keys
ssh kevin@90.195.120.165 "chmod 600 ~/.ssh/authorized_keys"
```

---

## 🛠️ 管理SSH密钥（服务器端）

可以使用管理脚本查看和管理服务器上的所有授权密钥：

```bash
# 运行管理脚本
./manage-ssh-keys.sh
```

功能包括：
- 查看所有授权密钥
- 添加新公钥
- 删除公钥
- 备份授权密钥文件
- 检查文件权限
- 测试SSH连接

---

## ⚙️ 可选：配置SSH Config文件

为了方便管理多个SSH连接，可以在新电脑上创建 `~/.ssh/config` 文件：

```bash
# 编辑SSH config文件
nano ~/.ssh/config
# 或
vim ~/.ssh/config
```

添加以下内容：

```
Host server-kevin
    HostName 90.195.120.165
    User kevin
    IdentityFile ~/.ssh/id_ed25519
    Port 22
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

保存后，就可以使用简化命令连接：

```bash
# 使用别名连接
ssh server-kevin
```

---

## 🔒 安全建议

1. **使用SSH密钥而不是密码**：更安全，且更方便
2. **为私钥设置密码**：即使私钥泄露，也需要密码才能使用
3. **定期轮换密钥**：建议每年更换一次SSH密钥
4. **限制访问权限**：在服务器上可以限制特定用户或IP的访问
5. **禁用密码登录**（可选）：如果所有电脑都使用密钥，可以禁用密码登录：

```bash
# 在服务器上编辑SSH配置
sudo nano /etc/ssh/sshd_config

# 设置以下选项
PasswordAuthentication no
PubkeyAuthentication yes

# 重启SSH服务
sudo systemctl restart sshd
```

---

## 🐛 故障排查

### 问题1: 仍然要求输入密码

**检查权限**：
```bash
# 在服务器上检查文件权限
ls -la ~/.ssh/
# 应该显示：
# drwx------ .ssh
# -rw------- authorized_keys
```

**修复权限**：
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 问题2: 连接被拒绝

**检查SSH服务**：
```bash
# 在服务器上检查SSH服务状态
sudo systemctl status sshd
```

**检查防火墙**：
```bash
# 检查防火墙规则
sudo ufw status
# 确保SSH端口（22）是开放的
sudo ufw allow 22/tcp
```

### 问题3: 公钥格式错误

确保公钥格式正确：
- 应该是一行完整的文本
- 以 `ssh-ed25519`、`ssh-rsa`、`ecdsa-sha2-nistp256` 等开头
- 不要有多余的空格或换行

---

## 📚 相关文件位置

- **本地SSH密钥**：`~/.ssh/id_ed25519`（私钥）和 `~/.ssh/id_ed25519.pub`（公钥）
- **服务器授权文件**：`~/.ssh/authorized_keys`
- **SSH配置文件**：`~/.ssh/config`（本地）和 `/etc/ssh/sshd_config`（服务器）

---

## 🎯 快速检查清单

- [ ] 新电脑已生成SSH密钥对
- [ ] 公钥已添加到服务器的 `authorized_keys` 文件
- [ ] 文件权限正确（`.ssh` 目录：700，`authorized_keys`：600）
- [ ] 可以从新电脑无密码连接服务器
- [ ] （可选）已配置SSH config文件

---

## 💡 提示

- 如果多台电脑使用相同的密钥，建议每台电脑生成独立的密钥对，便于管理和撤销访问
- 可以在公钥中添加注释来标识是哪台电脑，例如：`ssh-ed25519 AAAAC3... your-computer-name`
- 使用 `ssh -v` 可以查看详细的连接日志，帮助排查问题

