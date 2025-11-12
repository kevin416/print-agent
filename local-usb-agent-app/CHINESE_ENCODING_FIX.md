# 中文编码乱码问题修复

## 问题描述

用户反馈打印中文内容时出现乱码。经过分析，发现问题是：

1. **浏览器端**：`WebESCPOSBuilder` 生成的数据中，文本部分是 **UTF-8 编码**
2. **本地代理**：接收到数据后，直接发送到打印机，**没有进行编码转换**
3. **打印机**：期望接收 **GBK/GB18030 编码**的数据
4. **结果**：UTF-8 编码的中文字符在打印机上显示为乱码

## 解决方案

### 1. 浏览器端标识数据编码

在 `manager_next/src/services/localAgentClient.ts` 中，发送打印请求时添加 `charset: 'utf8'` 标识：

```typescript
const payload: Record<string, any> = {
  connectionType: request.connectionType || (request.ip ? 'tcp' : 'usb'),
  printerId: request.printerId,
  encoding: 'base64' as const,
  data: uint8ToBase64(request.data),
  charset: 'utf8' // 🔥 标识数据是 UTF-8 编码，需要转换为 GBK
}
```

### 2. 本地代理编码转换

在 `print-agent/local-usb-agent-app/src/main/server.js` 中，检测到 `charset: 'utf8'` 时，将 ESC/POS 数据流从 UTF-8 转换为 GBK：

```javascript
// 如果指定了 charset 为 'utf8'，需要将 UTF-8 转换为 GBK
if (charset === 'utf8' || charset === 'utf-8') {
  // 解析 ESC/POS 数据流，只转换文本部分
  const convertedBuffer = convertEscPosUtf8ToGbk(buffer);
  payload = { data: convertedBuffer, encoding: 'buffer' };
}
```

### 3. ESC/POS 数据流解析

实现 `convertEscPosUtf8ToGbk` 函数，使用状态机解析 ESC/POS 数据流：

1. **识别命令**：检测 ESC (0x1B)、GS (0x1D)、1C (0x1C) 开头的命令
2. **保留命令**：命令字节保持不变，直接复制到输出
3. **转换文本**：文本部分从 UTF-8 解码为字符串，再编码为 GBK

### 4. 支持的 ESC/POS 命令

当前实现支持以下 ESC/POS 命令：

- **ESC @** (0x1B 0x40) - 初始化
- **ESC a n** (0x1B 0x61 n) - 对齐
- **ESC E n** (0x1B 0x45 n) - 粗体
- **ESC ! n** (0x1B 0x21 n) - 字体大小
- **ESC d n** (0x1B 0x64 n) - 换行
- **ESC * m nL nH** (0x1B 0x2A m nL nH) - 位图打印
- **ESC D n1 n2 ... NUL** (0x1B 0x44 ... 0x00) - 制表符
- **1C 43 n** (0x1C 0x43 n) - 编码设置
- **GS ! n** (0x1D 0x21 n) - 字符大小
- **GS v 0 m xL xH yL yH** (0x1D 0x76 0x30 m xL xH yL yH) - 位图打印
- **GS ( k ...** (0x1D 0x28 k ...) - 功能命令

## 技术细节

### 编码转换流程

1. **接收数据**：本地代理接收到 base64 编码的数据
2. **解码 base64**：将 base64 数据解码为 Buffer
3. **检测编码**：检查 `charset` 参数，如果是 'utf8'，则进行转换
4. **解析数据流**：使用状态机解析 ESC/POS 数据流
5. **转换文本**：将文本部分从 UTF-8 转换为 GBK
6. **保留命令**：命令字节保持不变
7. **发送到打印机**：将转换后的数据发送到打印机

### 错误处理

- **转换失败**：如果 UTF-8 到 GBK 转换失败（例如，数据包含二进制数据），直接使用原字节
- **日志记录**：记录转换失败的详细信息，便于调试

## 测试建议

1. **测试中文打印**：
   - 打印包含中文的小票/餐单
   - 验证中文显示正常，无乱码

2. **测试命令保留**：
   - 打印包含格式命令（粗体、对齐、字体大小）的内容
   - 验证格式命令正常工作

3. **测试位图打印**（如果支持）：
   - 打印包含图片的内容
   - 验证图片显示正常

## 注意事项

1. **位图数据**：位图数据是二进制数据，不应该被 UTF-8 到 GBK 转换。当前实现可能会将位图数据作为文本处理，这可能导致问题。如果打印包含位图的内容，可能需要进一步优化。

2. **性能**：编码转换会增加一定的处理时间，但对于大多数打印任务，影响可以忽略不计。

3. **兼容性**：当前实现支持常见的 ESC/POS 命令，但可能不支持所有命令。如果遇到不支持的命令，会保守处理（只提取第一个字节）。

## 相关文件

- `manager_next/src/services/localAgentClient.ts` - 浏览器端打印客户端
- `print-agent/local-usb-agent-app/src/main/server.js` - 本地代理服务器
- `FastPrintLib/src/connections/web/WebESCPOSBuilder.ts` - ESC/POS 命令构建器

