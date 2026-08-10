//! 加密解密工具模块
//! 使用 AES-256-GCM 实现 AI Token 本地加密存储与读取
//! 密钥由机器特征码派生，确保同机加解密、换机不可用

use crate::error::{AppError, AppResult, ErrorCode};
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// 加密后的数据包结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedData {
    /// Base64编码的密文
    pub ciphertext: String,
    /// Base64编码的Nonce（12字节）
    pub nonce: String,
}

/// 机器特征码（Demo版使用固定种子，生产环境应读取机器码）
const MACHINE_SEED: &str = "tauri-ai-demo-machine-key-seed-v1";

/// 从机器特征码派生256位密钥
fn derive_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(MACHINE_SEED.as_bytes());
    hasher.update(std::env::consts::OS.as_bytes());
    hasher.update(std::env::consts::ARCH.as_bytes());
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

/// AES-256-GCM 加密
///
/// # 参数
/// - `plaintext`: 明文字符串
///
/// # 返回
/// - `EncryptedData`: 包含密文和Nonce的结构体
pub fn encrypt(plaintext: &str) -> AppResult<EncryptedData> {
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| {
        AppError::with_source(ErrorCode::EncryptFailed, "密钥初始化失败", e.to_string())
    })?;

    // 生成随机12字节Nonce
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // 加密
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).map_err(|e| {
        AppError::with_source(ErrorCode::EncryptFailed, "AES加密失败", e.to_string())
    })?;

    Ok(EncryptedData {
        ciphertext: B64.encode(&ciphertext),
        nonce: B64.encode(&nonce_bytes),
    })
}

/// AES-256-GCM 解密
///
/// # 参数
/// - `data`: 加密数据包
///
/// # 返回
/// - `String`: 解密后的明文
pub fn decrypt(data: &EncryptedData) -> AppResult<String> {
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| {
        AppError::with_source(ErrorCode::DecryptFailed, "密钥初始化失败", e.to_string())
    })?;

    // 解码Nonce
    let nonce_bytes = B64.decode(&data.nonce).map_err(|e| {
        AppError::with_source(ErrorCode::DecryptFailed, "Nonce解码失败", e.to_string())
    })?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    // 解码密文
    let ciphertext = B64.decode(&data.ciphertext).map_err(|e| {
        AppError::with_source(ErrorCode::DecryptFailed, "密文解码失败", e.to_string())
    })?;

    // 解密
    let plaintext = cipher.decrypt(nonce, ciphertext.as_ref()).map_err(|e| {
        AppError::with_source(ErrorCode::DecryptFailed, "AES解密失败", e.to_string())
    })?;

    String::from_utf8(plaintext).map_err(|e| {
        AppError::with_source(
            ErrorCode::DecryptFailed,
            "解密结果UTF8解码失败",
            e.to_string(),
        )
    })
}

/// 简易Token加密（直接返回JSON字符串，方便存储）
pub fn encrypt_token(token: &str) -> AppResult<String> {
    let data = encrypt(token)?;
    serde_json::to_string(&data).map_err(|e| {
        AppError::with_source(
            ErrorCode::EncryptFailed,
            "加密结果序列化失败",
            e.to_string(),
        )
    })
}

/// 简易Token解密（从JSON字符串恢复）
pub fn decrypt_token(encrypted_json: &str) -> AppResult<String> {
    let data: EncryptedData = serde_json::from_str(encrypted_json).map_err(|e| {
        AppError::with_source(
            ErrorCode::DecryptFailed,
            "加密数据反序列化失败",
            e.to_string(),
        )
    })?;
    decrypt(&data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let original = "sk-1234567890abcdef-test-token";
        let encrypted = encrypt_token(original).unwrap();
        let decrypted = decrypt_token(&encrypted).unwrap();
        assert_eq!(original, decrypted);
    }

    #[test]
    fn test_encrypt_produces_different_nonce() {
        let token = "same-token";
        let e1 = encrypt(token).unwrap();
        let e2 = encrypt(token).unwrap();
        // 相同明文每次加密Nonce不同，密文也不同
        assert_ne!(e1.nonce, e2.nonce);
        assert_ne!(e1.ciphertext, e2.ciphertext);
    }
}
