try {
  process.loadEnvFile();
} catch {
  // 没有 .env 文件时继续使用系统环境变量
}
